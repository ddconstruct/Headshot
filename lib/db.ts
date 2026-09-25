/**
 * lib/db.ts — Postgres connection + schema bootstrap.
 *
 * Uses the `postgres` npm package against DATABASE_URL.
 * When DATABASE_URL is unset, `isDbConfigured()` returns false and the
 * lib/* modules fall back to their local JSON-file dev stores automatically.
 *
 * Serverless note (Vercel): point DATABASE_URL at your provider's POOLED
 * connection string (Neon pooler / Supabase Supavisor, usually port 6543).
 * The `postgres` client opens connections lazily and reuses one client per
 * process, which is the recommended pattern for serverless functions.
 */

import fs from "node:fs";
import path from "node:path";
import postgres, { type Sql } from "postgres";

let client: Sql | null = null;

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/** Lazily-created shared Postgres client. Throws if DATABASE_URL is unset. */
export function db(): Sql {
  if (!isDbConfigured()) {
    throw new Error("DATABASE_URL is not set — database features are unavailable.");
  }
  if (!client) {
    client = postgres(process.env.DATABASE_URL as string, {
      max: 5, // keep the pool small for serverless
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

let schemaPromise: Promise<void> | null = null;

/**
 * Idempotent schema bootstrap (CREATE TABLE IF NOT EXISTS from sql/schema.sql).
 * Safe to call on every boot and before DB operations — after the first call
 * it resolves immediately. The worker calls this on startup; API routes call
 * it lazily through the lib/* modules.
 */
export function ensureSchema(): Promise<void> {
  if (!isDbConfigured()) return Promise.resolve();
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const schemaPath = path.join(process.cwd(), "sql", "schema.sql");
      const schema = fs.readFileSync(schemaPath, "utf-8");
      // `postgres` doesn't allow multi-statement simple queries; split on
      // semicolons (the schema file has no semicolons inside statements).
      const statements = schema
        .split(";")
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith("--"));
      const sql = db();
      for (const stmt of statements) {
        await sql.unsafe(stmt);
      }
    })().catch((err) => {
      schemaPromise = null; // allow a later retry
      throw new Error(`Failed to apply sql/schema.sql: ${(err as Error).message}`);
    });
  }
  return schemaPromise;
}
