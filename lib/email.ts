/**
 * lib/email.ts — customer email delivery via Resend.
 *
 * Env: RESEND_API_KEY, EMAIL_FROM (e.g. "Headshots <orders@yourdomain.com>").
 * When unset, sending degrades gracefully: the call logs and returns
 * { sent: false } instead of throwing, so local dev never breaks.
 */

import { Resend } from "resend";

export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY && process.env.EMAIL_FROM);
}

export interface DeliveryEmail {
  to: string;
  name: string;
  packLabel: string;
  orderId: string;
  resultUrls: string[];
}

function deliveryHtml(d: DeliveryEmail): string {
  const links = d.resultUrls
    .map(
      (url, i) =>
        `<li style="margin:6px 0"><a href="${url}">Headshot ${i + 1}</a></li>`
    )
    .join("");
  return `
    <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#111">
      <h1>Your AI headshots are ready, ${escapeHtml(d.name)} 🎉</h1>
      <p>Your <strong>${escapeHtml(d.packLabel)}</strong> pack (order ${escapeHtml(d.orderId)})
      is complete. Download your headshots below — each link opens the full-resolution image:</p>
      <ul>${links}</ul>
      <p style="color:#555;font-size:14px">Tip: right-click / long-press each image and choose
      "Save image" to keep a copy. Your source selfies have been deleted from our servers.</p>
      <p style="color:#555;font-size:14px">Not happy with the likeness? You have 7 days from
      today to request a full refund — just reply to this email.</p>
    </div>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

/** Send the "your headshots are ready" email. Never throws for missing config. */
export async function sendDeliveryEmail(d: DeliveryEmail): Promise<{ sent: boolean }> {
  if (!isEmailConfigured()) {
    console.log(
      `[email] RESEND_API_KEY/EMAIL_FROM not set — skipping delivery email to ${d.to} ` +
        `(${d.resultUrls.length} headshots).`
    );
    return { sent: false };
  }
  try {
    const resend = new Resend(process.env.RESEND_API_KEY as string);
    const { error } = await resend.emails.send({
      from: process.env.EMAIL_FROM as string,
      to: d.to,
      subject: `Your AI headshots are ready (${d.resultUrls.length} photos)`,
      html: deliveryHtml(d),
    });
    if (error) {
      console.error(`[email] Resend error for order ${d.orderId}:`, error.message);
      return { sent: false };
    }
    console.log(`[email] Delivery email sent to ${d.to} for order ${d.orderId}.`);
    return { sent: true };
  } catch (err) {
    console.error(`[email] Failed to send delivery email for order ${d.orderId}:`, (err as Error).message);
    return { sent: false };
  }
}
