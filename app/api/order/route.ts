/**
 * POST /api/order — create an order from uploaded selfies.
 *
 * Expects multipart/form-data:
 *   - name:    string (required)
 *   - email:   string (required, basic format check)
 *   - pack:    "basic" | "standard" | "executive" (required)
 *   - selfies: 10–15 image files (JPG/PNG/WebP, ≤10 MB each)
 *
 * Returns: { orderId } — the client then calls /api/stripe/checkout with it.
 *
 * Rate limited: 5 orders/day per email and per IP (lib/ratelimit.ts).
 * Uploads go to R2 (public URLs) when configured, else local disk (dev).
 */

import { NextResponse } from "next/server";
import { createOrder, setSelfiePaths, PACKS, type PackId } from "@/lib/orders";
import { saveUpload, validateSelfie, MIN_SELFIES, MAX_SELFIES } from "@/lib/storage";
import { checkOrderRateLimit, recordOrderAttempt, MAX_ORDERS_PER_DAY } from "@/lib/ratelimit";

export const runtime = "nodejs"; // uses node:fs — do not switch to edge

function clientIp(req: Request): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export async function POST(req: Request) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data." }, { status: 400 });
  }

  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const pack = String(form.get("pack") ?? "").trim() as PackId;
  const files = form.getAll("selfies").filter((f): f is File => f instanceof File);

  if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required (results are delivered there)." }, { status: 400 });
  }
  if (!PACKS[pack]) {
    return NextResponse.json({ error: 'Pack must be one of "basic", "standard", "executive".' }, { status: 400 });
  }
  if (files.length < MIN_SELFIES || files.length > MAX_SELFIES) {
    return NextResponse.json(
      { error: `Upload ${MIN_SELFIES}–${MAX_SELFIES} selfies (you sent ${files.length}).` },
      { status: 400 }
    );
  }
  for (const file of files) {
    const problem = validateSelfie(file);
    if (problem) return NextResponse.json({ error: problem }, { status: 400 });
  }

  // Rate limit (checked after validation so bad requests don't burn quota).
  const ip = clientIp(req);
  const limit = await checkOrderRateLimit({ email, ip });
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error:
          `Too many orders from this ${limit.limitedBy} today ` +
          `(limit ${MAX_ORDERS_PER_DAY}/day). Please try again tomorrow.`,
      },
      { status: 429 }
    );
  }

  // Create the order first so uploads have an ID-namespaced directory/key prefix.
  const order = await createOrder({ name, email, pack, selfiePaths: [] });

  try {
    const paths: string[] = [];
    for (const file of files) {
      // R2 configured → public URL; otherwise a local path (dev only).
      paths.push(await saveUpload(order.id, file));
    }
    await setSelfiePaths(order.id, paths);
  } catch (err) {
    return NextResponse.json(
      { error: `Failed to store uploads: ${(err as Error).message}` },
      { status: 500 }
    );
  }

  await recordOrderAttempt({ email, ip });

  return NextResponse.json({ orderId: order.id, pack: PACKS[pack].label }, { status: 201 });
}
