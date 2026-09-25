/**
 * lib/ratelimit.ts — order-creation rate limiting.
 *
 * Caps: MAX_ORDERS_PER_DAY (default 5) per email address AND per IP, on a
 * rolling calendar-day window (UTC). Dependency-free: backed by the Postgres
 * `rate_limits` table when DATABASE_URL is set, otherwise a local JSON file
 * (RATE_LIMIT_DB, default ./data/rate_limits.json) for dev.
 */

import fs from "node:fs";
import path from "node:path";
import { db, ensureSchema, isDbConfigured } from "./db";

export const MAX_ORDERS_PER_DAY = 5;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  /** Which key tripped the limit, for the error message. */
  limitedBy?: string;
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// ---------------------------------------------------------------------------
// JSON dev fallback
// ---------------------------------------------------------------------------

function dbPath(): string {
  const p = process.env.RATE_LIMIT_DB || "./data/rate_limits.json";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function readAllJson(): Record<string, number> {
  try {
    return JSON.parse(fs.readFileSync(dbPath(), "utf-8")) as Record<string, number>;
  } catch {
    return {};
  }
}

function writeAllJson(counts: Record<string, number>): void {
  const p = dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(counts, null, 2), "utf-8");
}

/** Atomically increment a key's counter and return the new count. */
async function hit(key: string): Promise<number> {
  const day = todayUtc();
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<{ count: number }[]>`
      INSERT INTO rate_limits (key, window_start, count)
      VALUES (${key}, ${day}, 1)
      ON CONFLICT (key, window_start)
      DO UPDATE SET count = rate_limits.count + 1
      RETURNING count`;
    return rows[0].count;
  }
  const counts = readAllJson();
  const k = `${key}:${day}`;
  counts[k] = (counts[k] ?? 0) + 1;
  writeAllJson(counts);
  return counts[k];
}

async function countFor(key: string): Promise<number> {
  const day = todayUtc();
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<{ count: number }[]>`
      SELECT count FROM rate_limits WHERE key = ${key} AND window_start = ${day}`;
    return rows[0]?.count ?? 0;
  }
  return readAllJson()[`${key}:${day}`] ?? 0;
}

/**
 * Check (without consuming) whether an order may be created for this
 * email/IP pair. Call `recordOrderAttempt` only after the order passes
 * validation, so failed validations don't burn the quota.
 */
export async function checkOrderRateLimit(input: {
  email: string;
  ip: string;
}): Promise<RateLimitResult> {
  const emailKey = `order:email:${input.email.toLowerCase()}`;
  const ipKey = `order:ip:${input.ip}`;
  const [emailCount, ipCount] = await Promise.all([countFor(emailKey), countFor(ipKey)]);

  if (emailCount >= MAX_ORDERS_PER_DAY) {
    return { allowed: false, remaining: 0, limitedBy: "email" };
  }
  if (ipCount >= MAX_ORDERS_PER_DAY) {
    return { allowed: false, remaining: 0, limitedBy: "IP address" };
  }
  return {
    allowed: true,
    remaining: Math.min(MAX_ORDERS_PER_DAY - emailCount, MAX_ORDERS_PER_DAY - ipCount),
  };
}

/** Consume one unit of quota for this email/IP pair (call after order creation). */
export async function recordOrderAttempt(input: { email: string; ip: string }): Promise<void> {
  await Promise.all([
    hit(`order:email:${input.email.toLowerCase()}`),
    hit(`order:ip:${input.ip}`),
  ]);
}
