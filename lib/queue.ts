/**
 * lib/queue.ts — generation job queue.
 *
 * Primary backend: Postgres `jobs` table (see sql/schema.sql).
 * Dev fallback: JSON file (JOBS_DB, default ./data/jobs.json).
 *
 * Flow: the Stripe webhook calls enqueueJob(orderId) and returns immediately.
 * The background worker (scripts/worker.ts, `npm run worker`) claims pending
 * jobs one at a time and runs the 30–90 min generation there — never in the
 * webhook, which would time out.
 *
 * Retry policy: a failed attempt increments `attempts` and reschedules the job
 * with exponential backoff (5 min × attempts). After MAX_ATTEMPTS the job is
 * marked 'failed' permanently and the order is marked failed with the error.
 */

import fs from "node:fs";
import path from "node:path";
import { db, ensureSchema, isDbConfigured } from "./db";

export type JobStatus = "pending" | "running" | "done" | "failed";

export interface Job {
  id: string;
  orderId: string;
  status: JobStatus;
  attempts: number;
  runAfter: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export const MAX_ATTEMPTS = 3;
const BACKOFF_MINUTES = 5;

// ---------------------------------------------------------------------------
// JSON dev fallback
// ---------------------------------------------------------------------------

function dbPath(): string {
  const p = process.env.JOBS_DB || "./data/jobs.json";
  return path.isAbsolute(p) ? p : path.join(process.cwd(), p);
}

function readAllJson(): Job[] {
  try {
    return JSON.parse(fs.readFileSync(dbPath(), "utf-8")) as Job[];
  } catch {
    return [];
  }
}

function writeAllJson(jobs: Job[]): void {
  const p = dbPath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(jobs, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Row mapping (Postgres)
// ---------------------------------------------------------------------------

interface JobRow {
  id: string;
  order_id: string;
  status: string;
  attempts: number;
  run_after: Date;
  error: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToJob(r: JobRow): Job {
  return {
    id: r.id,
    orderId: r.order_id,
    status: r.status as JobStatus,
    attempts: r.attempts,
    runAfter: r.run_after.toISOString(),
    error: r.error ?? undefined,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
  };
}

/**
 * Enqueue a generation job for an order. Idempotent: if a live
 * (pending/running) job already exists for the order, it is returned instead
 * of creating a duplicate (webhooks can be delivered more than once).
 */
export async function enqueueJob(orderId: string): Promise<Job> {
  if (isDbConfigured()) {
    await ensureSchema();
    const existing = await db()<JobRow[]>`
      SELECT * FROM jobs WHERE order_id = ${orderId} AND status IN ('pending', 'running') LIMIT 1`;
    if (existing[0]) return rowToJob(existing[0]);
    const rows = await db()<JobRow[]>`
      INSERT INTO jobs (id, order_id, status) VALUES (${crypto.randomUUID()}, ${orderId}, 'pending')
      RETURNING *`;
    return rowToJob(rows[0]);
  }
  const jobs = readAllJson();
  const existing = jobs.find((j) => j.orderId === orderId && (j.status === "pending" || j.status === "running"));
  if (existing) return existing;
  const now = new Date().toISOString();
  const job: Job = {
    id: crypto.randomUUID(), orderId, status: "pending",
    attempts: 0, runAfter: now, createdAt: now, updatedAt: now,
  };
  jobs.push(job);
  writeAllJson(jobs);
  return job;
}

/**
 * Atomically claim the next due job (single UPDATE … RETURNING, so two
 * workers can never grab the same job). Returns undefined when the queue is
 * empty. Claiming bumps attempts immediately so a crashed worker's job
 * becomes eligible for retry after backoff instead of wedging the queue.
 */
export async function claimNextJob(): Promise<Job | undefined> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<JobRow[]>`
      UPDATE jobs SET status = 'running', attempts = attempts + 1, updated_at = NOW()
      WHERE id = (
        SELECT id FROM jobs
        WHERE status = 'pending' AND run_after <= NOW() AND attempts < ${MAX_ATTEMPTS}
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *`;
    return rows[0] ? rowToJob(rows[0]) : undefined;
  }
  const jobs = readAllJson();
  const now = new Date().toISOString();
  const job = jobs
    .filter((j) => j.status === "pending" && j.runAfter <= now && j.attempts < MAX_ATTEMPTS)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  if (!job) return undefined;
  job.status = "running";
  job.attempts += 1;
  job.updatedAt = now;
  writeAllJson(jobs);
  return job;
}

/**
 * A job attempt failed. If attempts remain, the job is requeued with backoff;
 * otherwise it is marked permanently failed and the error is returned so the
 * caller can fail the order too. Returns the updated job.
 */
export async function failJobAttempt(id: string, error: string): Promise<Job> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<JobRow[]>`
      UPDATE jobs
      SET status = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN 'failed' ELSE 'pending' END,
          error = ${error},
          run_after = CASE WHEN attempts >= ${MAX_ATTEMPTS} THEN run_after
                           ELSE NOW() + (${BACKOFF_MINUTES} * INTERVAL '1 minute') END,
          updated_at = NOW()
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) throw new Error(`Job not found: ${id}`);
    return rowToJob(rows[0]);
  }
  const jobs = readAllJson();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error(`Job not found: ${id}`);
  job.error = error;
  job.updatedAt = new Date().toISOString();
  if (job.attempts >= MAX_ATTEMPTS) {
    job.status = "failed";
  } else {
    job.status = "pending";
    job.runAfter = new Date(Date.now() + BACKOFF_MINUTES * 60 * 1000).toISOString();
  }
  writeAllJson(jobs);
  return job;
}

/** Job permanently failed (attempts exhausted). Kept for explicit admin use. */
export async function markJobFailed(id: string, error: string): Promise<Job> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<JobRow[]>`
      UPDATE jobs SET status = 'failed', error = ${error}, updated_at = NOW()
      WHERE id = ${id} RETURNING *`;
    if (!rows[0]) throw new Error(`Job not found: ${id}`);
    return rowToJob(rows[0]);
  }
  const jobs = readAllJson();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error(`Job not found: ${id}`);
  job.status = "failed";
  job.error = error;
  job.updatedAt = new Date().toISOString();
  writeAllJson(jobs);
  return job;
}

/** Job finished successfully. */
export async function markJobDone(id: string): Promise<Job> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<JobRow[]>`
      UPDATE jobs SET status = 'done', updated_at = NOW() WHERE id = ${id} RETURNING *`;
    if (!rows[0]) throw new Error(`Job not found: ${id}`);
    return rowToJob(rows[0]);
  }
  const jobs = readAllJson();
  const job = jobs.find((j) => j.id === id);
  if (!job) throw new Error(`Job not found: ${id}`);
  job.status = "done";
  job.updatedAt = new Date().toISOString();
  writeAllJson(jobs);
  return job;
}

/** Queue depth, for a future status dashboard. */
export async function pendingJobCount(): Promise<number> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<{ count: string }[]>`
      SELECT COUNT(*)::text AS count FROM jobs WHERE status = 'pending'`;
    return Number(rows[0].count);
  }
  return readAllJson().filter((j) => j.status === "pending").length;
}

/**
 * Requeue jobs stuck in 'running' (e.g. the worker crashed mid-generation).
 * Called once on worker startup. Jobs updated more than `staleMinutes` ago
 * go back to 'pending' keeping their attempts count.
 */
export async function requeueStaleJobs(staleMinutes = 120): Promise<number> {
  if (isDbConfigured()) {
    await ensureSchema();
    const rows = await db()<JobRow[]>`
      UPDATE jobs SET status = 'pending', updated_at = NOW()
      WHERE status = 'running' AND updated_at < NOW() - (${staleMinutes} * INTERVAL '1 minute')
      RETURNING *`;
    return rows.length;
  }
  const jobs = readAllJson();
  const cutoff = Date.now() - staleMinutes * 60 * 1000;
  let n = 0;
  for (const j of jobs) {
    if (j.status === "running" && new Date(j.updatedAt).getTime() < cutoff) {
      j.status = "pending";
      j.updatedAt = new Date().toISOString();
      n++;
    }
  }
  if (n > 0) writeAllJson(jobs);
  return n;
}
