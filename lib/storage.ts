/**
 * lib/storage.ts — selfie upload storage + result persistence.
 *
 * Two backends behind the same function signatures:
 *
 * 1. Cloudflare R2 (S3-compatible) — production. Enabled when ALL of
 *    R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and
 *    R2_PUBLIC_BASE_URL are set. saveUpload() returns a PUBLIC URL, which is
 *    what Replicate needs (it cannot read local disk paths).
 *
 * 2. Local disk (UPLOAD_DIR, default ./uploads) — dev fallback when R2 is not
 *    configured. Ephemeral on Vercel; generation cannot run against it.
 */

import fs from "node:fs";
import path from "node:path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB per selfie
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export const MAX_SELFIES = 15;
export const MIN_SELFIES = 10;

export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET &&
      process.env.R2_PUBLIC_BASE_URL
  );
}

let s3: S3Client | null = null;

function r2(): S3Client {
  if (!isR2Configured()) {
    throw new Error(
      "R2 is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, " +
        "R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_PUBLIC_BASE_URL (see .env.example)."
    );
  }
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: process.env.R2_ENDPOINT as string,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY as string,
      },
    });
  }
  return s3;
}

function publicUrl(key: string): string {
  return `${(process.env.R2_PUBLIC_BASE_URL as string).replace(/\/$/, "")}/${key}`;
}

export function uploadDir(): string {
  const dir = process.env.UPLOAD_DIR || "./uploads";
  return path.isAbsolute(dir) ? dir : path.join(process.cwd(), dir);
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "selfie";
}

export function validateSelfie(file: File): string | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return `Unsupported file type "${file.type || "unknown"}" — use JPG, PNG, or WebP.`;
  }
  if (file.size > MAX_FILE_BYTES) {
    return `"${file.name}" is ${(file.size / 1024 / 1024).toFixed(1)} MB — max 10 MB per photo.`;
  }
  if (file.size === 0) {
    return `"${file.name}" is empty.`;
  }
  return null;
}

/**
 * Persist one uploaded selfie and return its location.
 * - R2 configured → public https URL (usable by Replicate).
 * - Otherwise → local disk path (dev only).
 */
export async function saveUpload(orderId: string, file: File): Promise<string> {
  const buffer = Buffer.from(await file.arrayBuffer());
  const filename = `${Date.now()}-${sanitize(file.name)}`;

  if (isR2Configured()) {
    const key = `selfies/${orderId}/${filename}`;
    await r2().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET as string,
        Key: key,
        Body: buffer,
        ContentType: file.type || "application/octet-stream",
      })
    );
    return publicUrl(key);
  }

  const dir = path.join(uploadDir(), orderId);
  fs.mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, filename);
  fs.writeFileSync(dest, buffer);
  return dest;
}

/**
 * Delete all source selfies for an order (privacy: auto-delete after delivery).
 * Works for both backends; no-op-safe if nothing exists.
 */
export async function deleteUploads(orderId: string): Promise<void> {
  if (isR2Configured()) {
    const bucket = process.env.R2_BUCKET as string;
    const prefix = `selfies/${orderId}/`;
    let token: string | undefined;
    do {
      const listed = await r2().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
      );
      const keys = (listed.Contents ?? []).map((o) => o.Key as string).filter(Boolean);
      if (keys.length > 0) {
        await r2().send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((k) => ({ Key: k })) } })
        );
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    console.log(`[storage] Deleted source selfies for order ${orderId} from R2.`);
    return;
  }

  const dir = path.join(uploadDir(), orderId);
  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`[storage] Deleted local source selfies for order ${orderId}.`);
}

/**
 * Delete all stored RESULT headshots for an order (30-day retention cleanup).
 * No-op-safe if nothing exists.
 */
export async function deleteResults(orderId: string): Promise<void> {
  if (isR2Configured()) {
    const bucket = process.env.R2_BUCKET as string;
    const prefix = `results/${orderId}/`;
    let token: string | undefined;
    do {
      const listed = await r2().send(
        new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, ContinuationToken: token })
      );
      const keys = (listed.Contents ?? []).map((o) => o.Key as string).filter(Boolean);
      if (keys.length > 0) {
        await r2().send(
          new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: keys.map((k) => ({ Key: k })) } })
        );
      }
      token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
    } while (token);
    console.log(`[storage] Deleted result headshots for order ${orderId} from R2.`);
    return;
  }
  console.log(`[storage] Local dev: no result cleanup needed for order ${orderId}.`);
}

/**
 * Persist generated headshots to durable public storage.
 *
 * Replicate's output URLs are signed and EXPIRE — customers need permanent
 * links. When R2 is configured, each result is downloaded and re-uploaded to
 * `results/<orderId>/`, and the permanent public URLs are returned.
 * Otherwise the original (expiring) Replicate URLs are returned unchanged.
 */
export async function persistResults(orderId: string, resultUrls: string[]): Promise<string[]> {
  if (!isR2Configured()) {
    console.log(
      `[storage] R2 not configured — returning ${resultUrls.length} expiring Replicate URLs as-is.`
    );
    return resultUrls;
  }
  const bucket = process.env.R2_BUCKET as string;
  const finalUrls: string[] = [];
  for (let i = 0; i < resultUrls.length; i++) {
    const src = resultUrls[i];
    const res = await fetch(src);
    if (!res.ok) throw new Error(`Failed to download result ${i + 1}: HTTP ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const contentType = res.headers.get("content-type") || "image/jpeg";
    const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
    const key = `results/${orderId}/headshot-${String(i + 1).padStart(3, "0")}.${ext}`;
    await r2().send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: buffer, ContentType: contentType })
    );
    finalUrls.push(publicUrl(key));
  }
  console.log(`[storage] Persisted ${finalUrls.length} headshots for order ${orderId} to R2.`);
  return finalUrls;
}
