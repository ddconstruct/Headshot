/**
 * /refund-policy — refund policy page (linked from order + success pages,
 * and required by Stripe to be clearly published before taking payments).
 */

export default function RefundPolicyPage() {
  return (
    <>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Refund Policy</h1>
      <p style={{ color: "#94a3b8" }}>Last updated: September 24, 2026</p>

      <section style={section}>
        <h2 style={h2}>Our promise</h2>
        <p style={p}>
          If your finished headshots don&apos;t include a <strong>usable likeness of you</strong> —
          meaning the photos don&apos;t recognizably look like the person in the selfies you
          uploaded — you get a <strong>full refund</strong>. No forms, no interrogation.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>How to request a refund</h2>
        <p style={p}>
          Within <strong>7 days of delivery</strong>, reply to your headshot delivery email
          {process.env.EMAIL_FROM ? <> ({process.env.EMAIL_FROM})</> : null} with:
        </p>
        <ol style={p}>
          <li>Your order number (it&apos;s in the delivery email subject line), and</li>
          <li>One sentence on what&apos;s wrong (e.g. &quot;doesn&apos;t look like me&quot;).</li>
        </ol>
        <p style={p}>
          We review every request personally and issue approved refunds to your original
          payment method within <strong>5–10 business days</strong> via Stripe.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>What&apos;s not covered</h2>
        <ul style={p}>
          <li>
            <strong>Style preference:</strong> &quot;I wanted a different background&quot; isn&apos;t a
            likeness failure. Tell us before delivery and we&apos;ll regenerate in a different style free.
          </li>
          <li>
            <strong>After 7 days:</strong> requests made more than 7 days after delivery are reviewed
            case-by-case but aren&apos;t guaranteed.
          </li>
          <li>
            <strong>Unusable selfies:</strong> if fewer than 10 clear, front-facing selfies were uploaded
            and we warned you before generating, the likeness guarantee still applies — we&apos;d rather
            refund than deliver bad photos.
          </li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h2}>Failed generations</h2>
        <p style={p}>
          If our system fails to generate your headshots at all (not just a bad likeness — a
          technical failure), you are refunded <strong>automatically in full</strong>, no request needed.
        </p>
      </section>

      <p style={{ color: "#64748b", fontSize: 14, marginTop: 32 }}>
        <a href="/" style={link}>← Back to order</a>
        {" · "}
        <a href="/privacy" style={link}>Privacy Policy</a>
      </p>
    </>
  );
}

const section: React.CSSProperties = { marginTop: 24 };
const h2: React.CSSProperties = { fontSize: 20, marginBottom: 8 };
const p: React.CSSProperties = { color: "#cbd5e1", lineHeight: 1.6 };
const link: React.CSSProperties = { color: "#38bdf8" };
