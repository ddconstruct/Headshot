/**
 * POST /api/stripe/checkout — create a Stripe Checkout Session for an order.
 *
 * Body (JSON): { orderId: string }
 * Returns:     { url: string } — redirect the customer to this Stripe-hosted page.
 *
 * Prices come from Stripe Price IDs in env vars (STRIPE_PRICE_BASIC etc.).
 * If a price env var is missing, this route fails LOUDLY with instructions —
 * it never guesses a price or charges the wrong amount.
 */

import { NextResponse } from "next/server";
import Stripe from "stripe";
import { getOrder, PACKS } from "@/lib/orders";

export const runtime = "nodejs";

function stripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("STRIPE_SECRET_KEY is not set. Add it to your .env file (see .env.example).");
  }
  return new Stripe(key);
}

export async function POST(req: Request) {
  let body: { orderId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Expected JSON body: { orderId }." }, { status: 400 });
  }

  if (!body.orderId) {
    return NextResponse.json({ error: "orderId is required." }, { status: 400 });
  }

  const order = await getOrder(body.orderId);
  if (!order) return NextResponse.json({ error: "Order not found." }, { status: 404 });
  if (order.status !== "awaiting_payment") {
    return NextResponse.json(
      { error: `Order is already ${order.status} — cannot check out twice.` },
      { status: 409 }
    );
  }

  const pack = PACKS[order.pack];
  const priceId = process.env[pack.priceEnv];
  if (!priceId) {
    // Fail loudly: the operator must create the Stripe price and set the env var.
    return NextResponse.json(
      {
        error:
          `Missing ${pack.priceEnv}. Create the "${pack.label}" product/price in the ` +
          `Stripe Dashboard (see README "Stripe products"), then set ${pack.priceEnv} ` +
          `to the price ID (price_...) and redeploy. No charge was created.`,
      },
      { status: 500 }
    );
  }

  const baseUrl = (process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: order.email,
      metadata: { orderId: order.id, pack: order.pack },
      success_url: `${baseUrl}/success?order=${order.id}`,
      cancel_url: `${baseUrl}/?cancelled=1`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      { error: `Stripe error: ${(err as Error).message}` },
      { status: 502 }
    );
  }
}
