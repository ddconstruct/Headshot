/**
 * lib/replicate.ts — Replicate REST API client for face-preserving headshot generation.
 *
 * Default model: bytedance/flux-pulid (FLUX with PuLID face-identity preservation).
 * Fallback model:  zsxkib/instant-id
 *
 * INPUT SCHEMAS VERIFIED 2026-09-24 (against the live model API schema pages):
 *
 * bytedance/flux-pulid:
 *   main_face_image (string, required) — ID image for face generation
 *   prompt (string) | negative_prompt (string)
 *   width/height (int, 256-1536; defaults 896x1152) | num_steps (1-20, default 20)
 *   start_step (0-10, default 0; author recommends 4 for realistic images, 0-1 for stylized)
 *   guidance_scale (1-10, default 4) | id_weight (max 3, default 1)
 *   true_cfg (1-10, default 1) | max_sequence_length (128-512, default 128)
 *   output_format (webp|jpeg) | output_quality (1-100) | num_outputs (1-4, default 1)
 *   Output: array of image URLs.
 *
 * zsxkib/instant-id (fallback — NOTE: different field names):
 *   image (string, required — NOT main_face_image) — input face image
 *   prompt (string, default "a person") | negative_prompt (string)
 *   width/height (512-4096, default 640) | num_inference_steps (default 30)
 *   guidance_scale (1-50) | ip_adapter_scale (max 1.5, default 0.8)
 *   controlnet_conditioning_scale (max 1.5, default 0.8) | seed
 *   disable_safety_checker (bool, default false)
 *   Output: array of image URIs.
 *
 * Re-check these pages if generation quality drops — community model schemas drift.
 */

import { PACKS, type PackId } from "./packs";

const REPLICATE_API = "https://api.replicate.com/v1";

/** Default face-preserving model. */
export const DEFAULT_MODEL = "bytedance/flux-pulid";
/** Fallback if the default model fails. */
export const FALLBACK_MODEL = "zsxkib/instant-id";

function getToken(): string {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) {
    throw new Error(
      "REPLICATE_API_TOKEN is not set. Add it to your .env file (see .env.example)."
    );
  }
  return token;
}

/**
 * Style prompts used for generation.
 *
 * NOTE: tune these on 3-5 real faces before/after launch — prompt wording is
 * the biggest lever on output quality after the likeness settings above.
 * Add new entries to get more style variety; planRuns() spreads runs across
 * all entries automatically.
 */
export const STYLE_PROMPTS: Record<string, string> = {
  corporate:
    "professional corporate headshot, dark navy suit, white shirt, confident subtle smile, " +
    "soft studio lighting, blurred modern office background, sharp focus on face, " +
    "preserve the person's facial identity exactly, photorealistic",
  business_casual:
    "professional headshot, smart casual blazer, friendly expression, " +
    "natural window light, neutral gray studio background, " +
    "preserve the person's facial identity exactly, photorealistic",
  outdoor:
    "professional headshot outdoors, business attire, warm golden-hour light, " +
    "softly blurred city park background, " +
    "preserve the person's facial identity exactly, photorealistic",
  studio:
    "classic studio portrait headshot, dark blazer, dramatic soft key light, " +
    "dark gradient studio backdrop, " +
    "preserve the person's facial identity exactly, photorealistic",
  creative:
    "modern creative professional headshot, stylish casual attire, " +
    "colorful softly blurred studio background, confident expression, " +
    "preserve the person's facial identity exactly, photorealistic",
};

export const STYLES = Object.keys(STYLE_PROMPTS);

/**
 * How many generation runs each pack needs (4 images per run) and how they
 * spread across styles. Basic: 40 = 10 runs, Standard: 100 = 25 runs,
 * Executive: 200 = 50 runs. Runs cycle round-robin through STYLES so adding
 * new styles automatically increases variety.
 */
export function planRuns(pack: PackId): string[] {
  const totalRuns = PACKS[pack].headshots / 4;
  const runs: string[] = [];
  for (let i = 0; i < totalRuns; i++) runs.push(STYLES[i % STYLES.length]);
  return runs;
}

interface Prediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: string | string[];
  error?: unknown;
  urls?: { get: string; cancel: string; stream?: string };
}

async function api(path: string, init: RequestInit = {}): Promise<any> {
  const res = await fetch(`${REPLICATE_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getToken()}`,
      "Content-Type": "application/json",
      Prefer: "wait", // ask Replicate to hold the connection briefly
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Replicate API ${res.status}: ${body.slice(0, 500)}`);
  }
  return res.json();
}

/** Shared negative prompt — keeps outputs clean and professional. */
const NEGATIVE_PROMPT =
  "bad quality, worst quality, text, signature, watermark, extra limbs, " +
  "blurry, distorted face, deformed facial features";

/**
 * Build the model input for one generation run.
 * Field names verified 2026-09-24 (see header). The fallback model uses
 * `image` instead of `main_face_image`, hence the model switch.
 */
function buildInput(
  imageUrls: string[],
  stylePrompt: string,
  model: string
): Record<string, unknown> {
  if (model === FALLBACK_MODEL) {
    return {
      image: imageUrls[0],
      prompt: stylePrompt,
      negative_prompt: NEGATIVE_PROMPT,
      width: 768,
      height: 1024, // portrait orientation for headshots
      num_inference_steps: 30,
      guidance_scale: 5,
      ip_adapter_scale: 0.8,
      controlnet_conditioning_scale: 0.8, // identity fidelity
      disable_safety_checker: false,
    };
  }
  // bytedance/flux-pulid (default)
  return {
    main_face_image: imageUrls[0],
    prompt: stylePrompt,
    negative_prompt: NEGATIVE_PROMPT,
    width: 896,
    height: 1152, // portrait orientation for headshots
    num_steps: 20,
    // start_step: 0 = max likeness, 4 = max editability (author's suggestion
    // for realistic images). 2 is a middle ground for headshots — likeness
    // matters more than background variety. Re-tune on real faces.
    start_step: 2,
    guidance_scale: 4,
    id_weight: 1,
    true_cfg: 1,
    // jpg: universal compatibility for email delivery + downloads.
    output_format: "jpg",
    output_quality: 90,
    num_outputs: 4,
  };
}

async function createPrediction(
  model: string,
  input: Record<string, unknown>
): Promise<Prediction> {
  const [owner, name] = model.split("/");
  return api(`/models/${owner}/${name}/predictions`, {
    method: "POST",
    body: JSON.stringify({ input }),
  });
}

async function pollPrediction(
  predictionId: string,
  { timeoutMs = 15 * 60 * 1000, intervalMs = 10000 }: { timeoutMs?: number; intervalMs?: number } = {}
): Promise<Prediction> {
  const started = Date.now();
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const p: Prediction = await api(`/predictions/${predictionId}`);
    if (p.status === "succeeded" || p.status === "failed" || p.status === "canceled") {
      return p;
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(`Replicate prediction ${predictionId} timed out after ${timeoutMs}ms`);
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
}

async function runStyleOnce(
  model: string,
  imageUrls: string[],
  style: string
): Promise<string[]> {
  const input = buildInput(imageUrls, STYLE_PROMPTS[style], model);
  const prediction = await pollPrediction((await createPrediction(model, input)).id);
  if (prediction.status !== "succeeded" || !prediction.output) {
    throw new Error(
      `Prediction ${prediction.status}: ${JSON.stringify(prediction.error ?? prediction.status)}`
    );
  }
  return Array.isArray(prediction.output) ? prediction.output : [prediction.output];
}

/**
 * Generate headshots for the given source images across the given styles
 * (one entry per run — use planRuns(pack) to build the list).
 *
 * Per-style fallback: if a run fails on the default model it is retried ONCE
 * on FALLBACK_MODEL before the error propagates. The worker treats a
 * propagated error as a failed job attempt.
 *
 * @param imageUrls  Publicly reachable URLs of the customer's selfies.
 *                   IMPORTANT: Replicate cannot read local disk paths — images must be
 *                   on public storage (R2) first.
 */
export async function generateHeadshots(
  imageUrls: string[],
  styles: string[],
  model: string = DEFAULT_MODEL
): Promise<string[]> {
  if (imageUrls.length === 0) throw new Error("generateHeadshots: no image URLs provided");
  for (const s of styles) {
    if (!STYLE_PROMPTS[s]) throw new Error(`generateHeadshots: unknown style "${s}"`);
  }

  const results: string[] = [];

  // Sequential per style keeps peak GPU spend predictable. Switch to
  // Promise.all with a concurrency limit once volume justifies it.
  for (const style of styles) {
    let outputs: string[];
    try {
      outputs = await runStyleOnce(model, imageUrls, style);
    } catch (err) {
      const msg = (err as Error).message;
      if (model !== FALLBACK_MODEL) {
        console.log(
          `[replicate] Style "${style}" failed on ${model} (${msg}) — retrying once on ${FALLBACK_MODEL}.`
        );
        outputs = await runStyleOnce(FALLBACK_MODEL, imageUrls, style);
      } else {
        throw new Error(`Generation failed for style "${style}" on ${model}: ${msg}`);
      }
    }
    results.push(...outputs);
  }

  return results;
}
