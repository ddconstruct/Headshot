/**
 * lib/packs.ts — pack catalog.
 * Counts/prices must match the Stripe products created per README.
 */

export type PackId = "basic" | "standard" | "executive";

export const PACKS: Record<
  PackId,
  { label: string; priceCents: number; headshots: number; priceEnv: string }
> = {
  basic:     { label: "Basic",     priceCents: 2900, headshots: 40,  priceEnv: "STRIPE_PRICE_BASIC" },
  standard:  { label: "Standard",  priceCents: 4900, headshots: 100, priceEnv: "STRIPE_PRICE_STANDARD" },
  executive: { label: "Executive", priceCents: 7900, headshots: 200, priceEnv: "STRIPE_PRICE_EXECUTIVE" },
};
