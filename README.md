# AI Headshot Generator — backend

Next.js 14 (App Router, TypeScript) backend for the AI headshot business:
customers upload 10–15 selfies, pay via Stripe, a background worker generates
studio-quality headshots with Replicate, and results are emailed to the customer.

> Status: launch-ready code. Order intake + Stripe checkout + generation queue +
> email delivery + policies are implemented. It takes real money only after the
> "Still needs David" checklist at the bottom is done (API keys/accounts + one
> test purchase).

## File map

| Path | What it does |
|---|---|
| `app/page.tsx` | Order form: pack picker, name/email, 10–15 selfie upload → `/api/order` → Stripe Checkout. Footer links to the policy pages |
| `app/success/page.tsx` | Post-payment confirmation (Stripe `success_url` target) |
| `app/refund-policy/page.tsx` | Refund policy: full refund if no usable likeness within 7 days |
| `app/privacy/page.tsx` | Privacy policy: biometric-data use, retention, auto-delete, deletion on request |
| `app/layout.tsx` | Minimal root layout + dark styling |
| `app/api/order/route.ts` | `POST` — validates input, rate-limits (5/day per email & IP), stores uploads (R2 public URLs when configured), creates order → `{ orderId }` |
| `app/api/stripe/checkout/route.ts` | `POST { orderId }` — Stripe Checkout Session from Price IDs in env; fails loudly if a price env var is missing |
| `app/api/stripe/webhook/route.ts` | `POST` — verifies `stripe-signature`; on `checkout.session.completed` marks the order `paid` and **enqueues** a generation job (never generates inline — it would time out) |
| `lib/packs.ts` | Pack catalog (`basic`/`standard`/`executive`) — counts/prices must match Stripe |
| `lib/orders.ts` | Order CRUD (async). Postgres when `DATABASE_URL` is set, JSON file dev fallback otherwise. `markComplete()` also sends the delivery email |
| `lib/db.ts` | Postgres client (`postgres` package) + idempotent schema bootstrap from `sql/schema.sql` |
| `lib/storage.ts` | Uploads: R2 (public URLs) when `R2_*` vars are set, local disk dev fallback. `persistResults()` re-hosts Replicate outputs on R2 (their URLs expire). `deleteUploads()`/`deleteResults()` for the privacy retention promises |
| `lib/queue.ts` | `jobs` table abstraction: `enqueueJob` (idempotent), `claimNextJob` (atomic), `failJobAttempt` (backoff → permanent failure), `markJobDone`, `requeueStaleJobs` |
| `lib/replicate.ts` | Replicate REST client. Default `bytedance/flux-pulid`, fallback `zsxkib/instant-id`. Input schemas **verified 2026-09-24** (see header comments). Per-style fallback retry: a failed style is retried once on the fallback model. `planRuns(pack)` spreads runs across styles |
| `lib/email.ts` | Resend delivery emails (`RESEND_API_KEY` + `EMAIL_FROM`); degrades gracefully in dev |
| `lib/ratelimit.ts` | 5 orders/day per email and per IP, DB-backed with JSON dev fallback |
| `scripts/worker.ts` | Background generation worker — `npm run worker`. Claims jobs, generates, persists, emails, deletes source selfies, hourly retention cleanup |
| `sql/schema.sql` | Postgres schema: `orders`, `jobs`, `rate_limits` |
| `.env.example` | All env vars (no real secrets — fill in your own) |

## Setup

### 1. Install

```bash
cd headshot-app
npm install
cp .env.example .env   # then fill in values per sections below
npm run dev            # http://localhost:3000 — order form
npm run worker         # separate terminal — generation worker
```

### 2. Database (Postgres)

Any Postgres works (Neon and Supabase both have free tiers).

1. Create a database, copy its connection string → `DATABASE_URL`.
2. **Serverless tip:** use the provider's *pooled* connection string (Neon pooler /
   Supabase Supavisor, usually port 6543) — Vercel functions open many short connections.
3. Apply the schema once (also auto-applied on worker boot, idempotently):
   ```bash
   psql "$DATABASE_URL" -f sql/schema.sql
   ```
4. Leave `DATABASE_URL` unset for local dev — the app falls back to `./data/*.json` files.

### 3. Photo storage (Cloudflare R2)

Replicate can only read **public URLs**, so this is required before real orders.

1. Cloudflare dashboard → R2 → create bucket (e.g. `headshot-uploads`).
2. Create an API token with Object Read & Write on that bucket.
3. Make the bucket public: either attach a custom domain or enable the
   `https://pub-<id>.r2.dev` public URL (Settings → Public access).
4. Fill in `.env`: `R2_ENDPOINT` (e.g. `https://<account-id>.r2.cloudflarestorage.com`),
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
   (the public base URL from step 3, no trailing slash).

### 4. Email (Resend)

1. https://resend.com → create account → verify your sending domain.
2. API Keys → create key → `RESEND_API_KEY`.
3. `EMAIL_FROM` must be a verified sender, e.g. `AI Headshots <orders@yourdomain.com>`.

### 5. Replicate API token

1. Create an account at https://replicate.com
2. **Account → API tokens** (https://replicate.com/account/api-tokens) → create → `REPLICATE_API_TOKEN`.
3. Pay-per-use, no monthly minimum. Face-preserving models ≈ $0.02/image
   (Sep 2026); a 40-headshot pack ≈ $1–2 compute. Confirm at https://replicate.com/pricing.

### 6. Stripe products & prices

Use **test mode** first (`sk_test_...`), then repeat in live mode.

1. https://dashboard.stripe.com → **Product catalog → Add product** (3×):

   | Product name | Price (one-time) | Env var |
   |---|---|---|
   | Headshots — Basic (40 headshots) | $29.00 USD | `STRIPE_PRICE_BASIC` |
   | Headshots — Standard (100 headshots) | $49.00 USD | `STRIPE_PRICE_STANDARD` |
   | Headshots — Executive (200 headshots) | $79.00 USD | `STRIPE_PRICE_EXECUTIVE` |

2. Paste each `price_...` ID into `.env`.
3. **Webhook:** Developers → Webhooks → **Add endpoint**
   - URL: `https://<your-domain>/api/stripe/webhook`
   - Events: `checkout.session.completed`
   - Signing secret (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`
   - Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`

### 7. All env vars (see `.env.example`)

`REPLICATE_API_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_BASIC/STANDARD/EXECUTIVE`, `NEXT_PUBLIC_BASE_URL`,
`DATABASE_URL`, `R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`,
`R2_BUCKET`, `R2_PUBLIC_BASE_URL`, `RESEND_API_KEY`, `EMAIL_FROM`,
`WORKER_POLL_SECONDS` (optional, default 30).

## Running the worker in production

The worker is a plain long-running Node process — Vercel's serverless functions
can't host it (max execution timeout), so run it **separately** from the web app:

- **Simplest (recommended):** a $5–7/mo always-on box — Railway, Render, or Fly.io.
  Deploy this repo there with the same env vars and set the start command to
  `npm run worker`. One instance is enough to start; job claiming is atomic, so
  you can add a second later without double-processing.
- **Cheapest:** any VPS you already have (`node` + `pm2 start npm --name headshots -- run worker`,
  or a systemd unit) with the env vars exported.
- **Zero new infra (limited):** Vercel Cron hitting a small `/api/worker/tick`
  endpoint every minute that claims and processes *one* job per invocation —
  not implemented here; the always-on worker above is simpler and more reliable
  for 30–90 min generations.

The worker also runs the 30-day result-retention cleanup hourly and requeues
jobs left `running` by a crashed worker on startup.

## Deploy the web app to Vercel

1. Push this folder to a Git repo (GitHub).
2. https://vercel.com → **Add New → Project** → import the repo.
3. **Environment Variables:** add every var from `.env.example` (live Stripe values).
4. Deploy. Point the Stripe webhook at `https://<your-app>.vercel.app/api/stripe/webhook`
   and copy the new `whsec_...` into Vercel env vars (redeploy after).

## Launch checklist

**Done in code ✓**
- [x] Durable order store — Postgres via `DATABASE_URL`, JSON dev fallback
- [x] Public image storage — R2 adapter returning public URLs, local dev fallback
- [x] Generation queue/worker — webhook only enqueues; `npm run worker` generates (30–90 min safe)
- [x] Replicate input schemas verified 2026-09-24 (flux-pulid + instant-id; see `lib/replicate.ts` header)
- [x] Fallback model retry — each failed style retried once on `zsxkib/instant-id`
- [x] Email delivery — Resend; `markComplete()` sends the gallery
- [x] Failure handling — 3 attempts w/ backoff, `markFailed()` stores the error, stale-job recovery
- [x] Refund policy page (`/refund-policy`) — linked from order page + success page
- [x] Privacy policy page (`/privacy`) — biometric disclosures; source selfies auto-deleted after delivery, results kept 30 days
- [x] Rate limiting — 5 orders/day per email and per IP, enforced in `/api/order`
- [x] Result persistence — Replicate's expiring URLs are re-hosted on R2 before emailing

**Still needs David (accounts/keys)**
- [ ] Replicate account + `REPLICATE_API_TOKEN`
- [ ] Postgres database (Neon/Supabase free tier) + `DATABASE_URL` (pooled string)
- [ ] Cloudflare R2 bucket + API token + public URL (`R2_*` vars)
- [ ] Resend account + verified sender domain (`RESEND_API_KEY`, `EMAIL_FROM`)
- [ ] Stripe **live** keys/prices/webhook secret swapped in
- [ ] One real $29 test purchase end-to-end (upload → pay → worker generates → email arrives)
- [ ] Tune `STYLE_PROMPTS` in `lib/replicate.ts` on 3–5 real faces before advertising

## Local end-to-end test (no keys needed)

```bash
npm run dev            # terminal 1 — http://localhost:3000
npm run worker         # terminal 2 — polls the queue, degrades gracefully
```
Create an order (uploads stay local, checkout needs Stripe test keys to go
further). The worker log shows exactly which integrations are missing.
