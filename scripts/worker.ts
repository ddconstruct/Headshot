/**
 * scripts/worker.ts — background generation worker.
 *
 * Run: `npm run worker` (uses tsx). Needs the same .env as the web app.
 *
 * Loop: claim one pending job → generate headshots via Replicate (30–90 min
 * per order) → persist results to R2 → mark order complete (emails customer)
 * → delete source selfies → mark job done.
 *
 * The Stripe webhook ONLY enqueues jobs — generation never runs there.
 *
 * Production: run this as an always-on process (see README "Running the
 * worker in production"). One worker at a time is fine to start; the claim
 * query is atomic so a second worker would never double-process a job.
 */

import dotenv from "dotenv";
dotenv.config();

import { ensureSchema } from "../lib/db";
import { isR2Configured, deleteUploads, deleteResults, persistResults } from "../lib/storage";
import { isEmailConfigured } from "../lib/email";
import {
  claimNextJob,
  failJobAttempt,
  markJobDone,
  markJobFailed,
  requeueStaleJobs,
  pendingJobCount,
} from "../lib/queue";
import {
  getOrder,
  getCompletedBefore,
  expireResults,
  markGenerating,
  markComplete,
  markFailed,
} from "../lib/orders";
import { generateHeadshots, planRuns } from "../lib/replicate";

const POLL_SECONDS = Number(process.env.WORKER_POLL_SECONDS ?? 30);
const RESULT_RETENTION_DAYS = 30; // must match the privacy policy
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // run retention cleanup hourly

let shuttingDown = false;
process.on("SIGINT", () => { shuttingDown = true; console.log("\n[worker] Shutting down…"); });
process.on("SIGTERM", () => { shuttingDown = true; console.log("\n[worker] Shutting down…"); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function processJob(jobId: string, orderId: string): Promise<void> {
  const order = await getOrder(orderId);
  if (!order) {
    const err = `Order ${orderId} not found — failing job permanently.`;
    console.error(`[worker] ${err}`);
    await markJobFailed(jobId, err);
    return;
  }

  // Replicate needs PUBLIC URLs. In dev (local disk) we can't generate.
  const publicUrls = order.selfiePaths.filter((p) => p.startsWith("http://") || p.startsWith("https://"));
  if (publicUrls.length === 0) {
    const err =
      "No public selfie URLs for this order (R2 storage is not configured). " +
      "Configure R2_* env vars so uploads get public URLs, then requeue the job.";
    console.error(`[worker] Order ${orderId}: ${err}`);
    await markJobFailed(jobId, err);
    await markFailed(orderId, err);
    return;
  }

  await markGenerating(orderId);
  console.log(`[worker] Generating ${order.pack} pack for order ${orderId} (${publicUrls.length} selfies)…`);

  try {
    const runs = planRuns(order.pack);
    const resultUrls = await generateHeadshots(publicUrls, runs);
    console.log(`[worker] Order ${orderId}: generated ${resultUrls.length} headshots, persisting…`);

    const finalUrls = await persistResults(orderId, resultUrls);
    await markComplete(orderId, finalUrls); // also emails the customer

    // Privacy promise: source selfies are deleted right after delivery.
    try {
      await deleteUploads(orderId);
    } catch (err) {
      console.error(`[worker] Order ${orderId}: failed to delete source selfies:`, (err as Error).message);
    }

    await markJobDone(jobId);
    console.log(`[worker] Order ${orderId} complete — ${finalUrls.length} headshots delivered.`);
  } catch (err) {
    const msg = (err as Error).message;
    console.error(`[worker] Order ${orderId} attempt failed: ${msg}`);
    const job = await failJobAttempt(jobId, msg);
    if (job.status === "failed") {
      await markFailed(orderId, `Generation failed after ${job.attempts} attempts: ${msg}`);
      console.error(`[worker] Order ${orderId} marked failed permanently.`);
    } else {
      console.log(`[worker] Order ${orderId} requeued (attempt ${job.attempts}).`);
    }
  }
}

/** Delete result files for orders past the retention window (privacy policy). */
async function runRetentionCleanup(): Promise<void> {
  const cutoff = new Date(Date.now() - RESULT_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const old = await getCompletedBefore(cutoff);
  for (const order of old) {
    try {
      await deleteResults(order.id);
      await expireResults(order.id);
      console.log(`[worker] Retention cleanup: expired results for order ${order.id}.`);
    } catch (err) {
      console.error(`[worker] Retention cleanup failed for order ${order.id}:`, (err as Error).message);
    }
  }
}

async function main(): Promise<void> {
  console.log("[worker] Starting headshot generation worker…");
  console.log(`[worker] DB:        ${process.env.DATABASE_URL ? "Postgres (DATABASE_URL)" : "JSON dev fallback"}`);
  console.log(`[worker] Storage:   ${isR2Configured() ? "Cloudflare R2" : "local disk (dev — generation will fail without public URLs)"}`);
  console.log(`[worker] Email:     ${isEmailConfigured() ? "Resend" : "not configured (delivery emails skipped)"}`);
  console.log(`[worker] Replicate: ${process.env.REPLICATE_API_TOKEN ? "token set" : "REPLICATE_API_TOKEN MISSING"}`);

  await ensureSchema();
  const stale = await requeueStaleJobs();
  if (stale > 0) console.log(`[worker] Requeued ${stale} stale job(s).`);

  let lastCleanup = 0;
  while (!shuttingDown) {
    try {
      if (Date.now() - lastCleanup > CLEANUP_INTERVAL_MS) {
        await runRetentionCleanup();
        lastCleanup = Date.now();
      }
      const job = await claimNextJob();
      if (job) {
        await processJob(job.id, job.orderId);
      } else {
        const pending = await pendingJobCount();
        if (pending > 0) console.log(`[worker] ${pending} pending job(s) waiting on backoff.`);
        await sleep(POLL_SECONDS * 1000);
      }
    } catch (err) {
      console.error("[worker] Loop error:", (err as Error).message);
      await sleep(POLL_SECONDS * 1000);
    }
  }
  console.log("[worker] Stopped.");
}

main().catch((err) => {
  console.error("[worker] Fatal:", err);
  process.exit(1);
});
