/**
 * POST /api/stripe/webhook — Stripe webhook endpoint.
 *
 * Verifies the Stripe signature (STRIPE_WEBHOOK_SECRET) and, on
 * checkout.session.completed, marks the order as paid and ENQUEUES a
 * generation job (lib/queue.ts).
 *
 * CRITICAL: this handler must return fast. Generation takes 30–90 minutes
 * and runs in the background worker (`npm run worker`), NEVER inline here —
 * the webhook would time out and Stripe would retry, double-enqueueing work.
 * enqueueJob() is idempotent, so even duplicate webhook deliveries are safe.
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrder, markPaid } from "@/lib/orders";
import { enqueueJob } from "@/lib/queue";
import { triggerWorkerDispatch } from "@/lib/github";

export const runtime = "nodejs";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY is not set.");
  return new Stripe(key);
}

export async function POST(req: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    // Misconfiguration on our side — tell Stripe to retry later (5xx).
    console.error("STRIPE_WEBHOOK_SECRET is not set; cannot verify webhook.");
    return NextResponse.json({ error: "Webhook not configured." }, { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header." }, { status: 400 });
  }

  // IMPORTANT: use the raw body for signature verification — never JSON-parse first.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", (err as Error).message);
    return NextResponse.json({ error: "Invalid signature." }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    const orderId = session.metadata?.orderId;

    if (!orderId) {
      console.error("checkout.session.completed with no orderId in metadata:", session.id);
      return NextResponse.json({ received: true }); // ack so Stripe doesn't retry forever
    }

    const order = await getOrder(orderId);
    if (!order) {
      console.error(`Order ${orderId} not found for Stripe session ${session.id}`);
      return NextResponse.json({ received: true });
    }

    if (order.status === "awaiting_payment") {
      await markPaid(orderId, session.id);
      const job = await enqueueJob(orderId);
      console.log(`Order ${orderId} marked paid (session ${session.id}); enqueued job ${job.id}.`);
      // Start generation now via GitHub Actions (no always-on worker host).
      // Awaited but failure-safe: the 12h scheduled sweep is the backup.
      try {
        await triggerWorkerDispatch(orderId);
      } catch (err) {
        console.error("Worker dispatch failed (backup sweep will catch it):", (err as Error).message);
      }
    } else {
      console.log(`Order ${orderId} already ${order.status}; ignoring duplicate webhook.`);
    }
  }

  // Acknowledge all other event types without action.
  return NextResponse.json({ received: true });
}
