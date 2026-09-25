/**
 * lib/orders.ts — order store.
 *
 * Primary backend: Postgres (DATABASE_URL) via lib/db.ts.
 * Dev fallback: JSON file on local disk (ORDERS_DB, default ./data/orders.json)
 * when DATABASE_URL is unset. Both backends share these function signatures,
 * so API routes and the worker don't care which is active.
 *
 * NOTE: all functions are async (DB access is async). Update callers with await.
 */

import fs from "node:fs";
import path from "node:path";
import { db, ensureSchema, isDbConfigured } from "./db";
import { PACKS, type PackId } from "./packs";
import { sendDeliveryEmail } from "./email";

export { PACKS };
export type { PackId };

export type OrderStatus =
  | "awaiting_payment"
  | "paid"
  | "generating"
  | "complete"
  | "failed";

export interface Order {
  id: string;
  name: string;
  email: string;
  pack: PackId;
  status: OrderStatus;
  /** Public URLs of the customer's selfies (R2) — local paths only in dev. */
  selfiePaths: string[];
  stripeSessionId?: string;
  /** Public URLs of the finished headshots. */
  resultUrls?: string[];
  /** Set when status === "failed". */
  failureError?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// JSON dev fallback
// ---------------------------------------------------------------------------

function dbPath(): string {
  const p = process.env.ORDERS_DB || "./data/orders.json";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function readAllJson(): Order[] {
  try {
    return JSON.parse(fs.readFileSync(dbPath(), "utf-8")) as Order[];
  } catch {
    return [];
  }
}

function writeAllJson(orders: Order[]): void {
  const p = dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(orders, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Row mapping (Postgres)
// ---------------------------------------------------------------------------

interface OrderRow {
  id: string;
  name: string;
  email: string;
  pack: string;
  status: string;
  selfie_paths: string[];
  stripe_session_id: string | null;
  result_urls: string[] | null;
  failure_error: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToOrder(r: OrderRow): Order {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    pack: r.pack as PackId,
    status: r.status as OrderStatus,
    selfiePaths: r.selfie_paths ?? [],
    stripeSessionId: r.stripe_session_id ?? undefined,
    resultUrls: r.result_urls ?? undefined,
    failureError: r.failure_error ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// CRUD — same signatures on both backends
// ---------------------------------------------------------------------------

export async function createOrder(input: {
  name: string;
  email: string;
  pack: PackId;
  selfiePaths: string[];
}): Promise<Order> {
  if (isDbConfigured()) {
    await ensureSchema();
    const sql = db();
    const id = crypto.randomUUID();
    const rows = await sql<OrderRow[]>`
      INSERT INTO orders (id, name, email, pack, status, selfie_paths)
      VALUES (${id}, ${input.name}, ${input.email}, ${input.pack}, 'awaiting_payment', ${sql.json(input.selfiePaths)})
      RETURNING *`;
    return rowToOrder(rows[0]);
  }
  const now = new Date().toISOString();
  const order: Order = {
    id: crypto.randomUUID(),
    name: input.name,
    email: input.email,
    pack: input.pack,
    status: "awaiting_payment",
    selfiePaths: input.selfiePaths,
    createdAt: now,
    updatedAt: now,
  };
  const orders = readAllJson();
  orders.push(order);
  writeAllJson(orders);
  return order;
}

export async function getOrder(id: string): Promise<Order | undefined> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<OrderRow[]>`SELECT * FROM orders WHERE id = ${id}`;
    return rows[0] ? rowToOrder(rows[0]) : undefined;
  }
  return readAllJson().find((o) => o.id === id);
}

type OrderPatch = Omit<Partial<Order>, "failureError"> & {
  failureError?: string | null;
};

async function updateOrder(id: string, patch: OrderPatch): Promise<Order> {
  if (isDbConfigured()) {
    await ensureSchema();
    const sets: string[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const values: any[] = [];
    let i = 1;
    const push = (col: string, v: unknown) => {
      sets.push(`${col} = $${i++}`);
      values.push(v);
    };
    if (patch.status !== undefined) push("status", patch.status);
    // JSONB columns: stringify in JS, cast in SQL (postgres.js would
    // otherwise serialize arrays as Postgres array literals).
    if (patch.selfiePaths !== undefined) {
      sets.push(`selfie_paths = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.selfiePaths));
    }
    if (patch.stripeSessionId !== undefined) push("stripe_session_id", patch.stripeSessionId);
    if (patch.resultUrls !== undefined) {
      sets.push(`result_urls = $${i++}::jsonb`);
      values.push(JSON.stringify(patch.resultUrls));
    }
    if (patch.failureError !== undefined) push("failure_error", patch.failureError);
    push("updated_at", new Date());
    const rows = await db().unsafe<OrderRow[]>(
      `UPDATE orders SET ${sets.join(", ")} WHERE id = $${i} RETURNING *`,
      [...values, id]
    );
    if (rows.length === 0) throw new Error(`Order not found: ${id}`);
    return rowToOrder(rows[0]);
  }
  const orders = readAllJson();
  const idx = orders.findIndex((o) => o.id === id);
  if (idx === -1) throw new Error(`Order not found: ${id}`);
  const { failureError, ...rest } = patch;
  const merged: Order = { ...orders[idx], ...rest, updatedAt: new Date().toISOString() };
  // null clears a previous failure; absent key preserves it.
  if ("failureError" in patch) merged.failureError = failureError ?? undefined;
  orders[idx] = merged;
  writeAllJson(orders);
  return orders[idx];
}

export async function markPaid(id: string, stripeSessionId: string): Promise<Order> {
  return updateOrder(id, { status: "paid", stripeSessionId });
}

/** Attach stored selfie paths/URLs after uploads are saved. */
export async function setSelfiePaths(id: string, selfiePaths: string[]): Promise<Order> {
  return updateOrder(id, { selfiePaths });
}

export async function markGenerating(id: string): Promise<Order> {
  return updateOrder(id, { status: "generating", failureError: null });
}

/**
 * Mark an order complete AND email the customer their headshot gallery.
 * Email delivery is best-effort: if Resend isn't configured (dev), it logs
 * and skips instead of failing the order.
 */
export async function markComplete(id: string, resultUrls: string[]): Promise<Order> {
  const order = await updateOrder(id, { status: "complete", resultUrls, failureError: null });
  await sendDeliveryEmail({
    to: order.email,
    name: order.name,
    packLabel: PACKS[order.pack].label,
    orderId: order.id,
    resultUrls,
  });
  return order;
}

/** Mark an order failed, storing the error for the operator to inspect. */
export async function markFailed(id: string, error?: string): Promise<Order> {
  return updateOrder(id, { status: "failed", failureError: error });
}

/** Orders completed before the given ISO timestamp (for retention cleanup). */
export async function getCompletedBefore(cutoffIso: string): Promise<Order[]> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<OrderRow[]>`
      SELECT * FROM orders WHERE status = 'complete' AND updated_at < ${cutoffIso}
      ORDER BY updated_at ASC LIMIT 100`;
    return rows.map(rowToOrder);
  }
  return readAllJson().filter((o) => o.status === "complete" && o.updatedAt < cutoffIso);
}

/** Clear stored result URLs after the retention window (files deleted separately). */
export async function expireResults(id: string): Promise<Order> {
  return updateOrder(id, { resultUrls: [] });
}
