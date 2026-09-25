/**
 * /success — shown after Stripe redirects back.
 * Payment is confirmed; the background worker picks up the enqueued
 * generation job and emails results when ready.
 */
export default function SuccessPage({
  searchParams,
}: {
  searchParams: { order?: string };
}) {
  return (
    <>
      <h1 style={{ fontSize: 32 }}>Payment received ✓</h1>
      <p style={{ color: "#94a3b8" }}>
        {searchParams.order
          ? <>Order <code>{searchParams.order}</code> is confirmed.</>
          : "Your order is confirmed."}{" "}
        Your headshots are being generated and will be emailed to you when ready
        (typically within 2 hours).
      </p>
      <p style={{ color: "#64748b", fontSize: 14 }}>
        Questions? Reply to your confirmation email and we&apos;ll sort it out.
      </p>
      <p style={{ color: "#64748b", fontSize: 13, marginTop: 24 }}>
        <a href="/refund-policy" style={{ color: "#38bdf8" }}>Refund Policy</a>
        {" · "}
        <a href="/privacy" style={{ color: "#38bdf8" }}>Privacy Policy</a>
      </p>
    </>
  );
}
