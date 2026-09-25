# Deploy guide — AI Headshot Generator

Two pieces deploy separately from this one repo:

| Piece | Host | Cost | Start command |
|---|---|---|---|
| Web app (order page, Stripe checkout/webhook) | Vercel | Free | `npm run build` → `npm start` (automatic) |
| Worker (photo generation, 30–90 min per order) | Railway | ~$5/mo (starts with $5 free trial credit) | `npm run worker` |

Vercel can't run the worker (serverless timeout) — that's why it's split.

## Step 1 — Push this repo to GitHub

The repo is already committed locally. On github.com, create a new **private** repo
named `headshot-app` (no README/license — the code is already here). Then:

```bash
cd ~/workspace/headshot-app
git remote add origin https://github.com/YOUR_USERNAME/headshot-app.git
git branch -M main
git push -u origin main
```

## Step 2 — Deploy the web app on Vercel (free)

1. Go to vercel.com → **Add New → Project** → import the `headshot-app` repo.
2. Add **every** variable from `.env.example` (values below). Use the **live**
   Stripe values, not test.
3. Deploy. Note your URL: `https://<your-app>.vercel.app`

### Environment variables (same list for Vercel AND Railway)

| Variable | Value / where to get it |
|---|---|
| `REPLICATE_API_TOKEN` | Replicate dashboard → API tokens (you hold this) |
| `STRIPE_SECRET_KEY` | Stripe dashboard → Developers → API keys → **live** `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Created in Step 3 below (`whsec_...`) |
| `STRIPE_PRICE_BASIC` | Stripe → Products → Basic $29 → Price ID (`price_...`) |
| `STRIPE_PRICE_STANDARD` | Stripe → Products → Standard $49 → Price ID |
| `STRIPE_PRICE_EXECUTIVE` | Stripe → Products → Executive $79 → Price ID |
| `NEXT_PUBLIC_BASE_URL` | Your Vercel URL, e.g. `https://<your-app>.vercel.app` |
| `DATABASE_URL` | Neon dashboard → pooled connection string (you hold this) |
| `R2_ENDPOINT` | `https://00bc055867ea5d14baf3d18b9ab6070d.r2.cloudflarestorage.com` |
| `R2_ACCESS_KEY_ID` | R2 API token (you hold this) |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret (you hold this) |
| `R2_BUCKET` | `headshot` |
| `R2_PUBLIC_BASE_URL` | `https://pub-94e22f4cb9664977abffb45168f11085.r2.dev` |
| `RESEND_API_KEY` | Resend dashboard → API keys (you hold this) |
| `EMAIL_FROM` | Leave empty until the $12 domain is bought & verified in Resend (app works without it) |

> Note: the static storefront page uses Stripe **payment links**
> (`buy.stripe.com/...`). This Next.js app uses Stripe **Checkout via Price IDs
> + webhook** instead — they're separate integrations. The three products above
> must exist as real Products in the Stripe dashboard.

## Step 3 — Stripe webhook

1. Stripe dashboard → Developers → Webhooks → **Add endpoint**
2. URL: `https://<your-app>.vercel.app/api/stripe/webhook`
3. Events: `checkout.session.completed`
4. Copy the **signing secret** (`whsec_...`) → add as `STRIPE_WEBHOOK_SECRET`
   in Vercel env vars → **redeploy** in Vercel so it picks the new var up.

## Step 4 — Deploy the worker on Railway (~$5/mo)

1. railway.app → **New Project → Deploy from GitHub repo** → `headshot-app`.
2. Settings → change the start command to `npm run worker`.
3. Add the **same env vars** as Vercel (copy/paste).
4. Deploy. The $5 trial credit covers the first month.

## Step 5 — Test before advertising

1. Place one real **$29 Basic** order yourself on the live site.
2. Upload 10–15 selfies, check out with Stripe.
3. Worker picks the job up within ~30s; generation takes 30–90 min.
4. Confirm the results land in R2 and the order completes.
5. Only then share the link publicly.

## Security

Rotate any key that was pasted into chat tonight (Replicate, Neon, R2, Resend)
before launch — generate fresh ones in each dashboard and update the env vars.
