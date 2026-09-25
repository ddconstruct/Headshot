/**
 * /privacy — privacy policy page, with the biometric-data disclosures that
 * matter for a selfie-upload product. Linked from the order + success pages.
 */

export default function PrivacyPage() {
  const contact = process.env.EMAIL_FROM;
  return (
    <>
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Privacy Policy</h1>
      <p style={{ color: "#94a3b8" }}>Last updated: September 24, 2026</p>

      <section style={section}>
        <h2 style={h2}>What we collect</h2>
        <ul style={p}>
          <li><strong>Your selfies</strong> (10–15 photos you upload) — these are biometric data.</li>
          <li><strong>Your name and email address</strong> — to create your order and deliver results.</li>
          <li><strong>Payment information</strong> — handled entirely by Stripe; we never see or store your card details.</li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h2}>What your selfies are used for</h2>
        <p style={p}>
          Exactly one thing: <strong>generating your headshots</strong>. Your photos are sent to our
          AI generation provider (Replicate) to create the headshots you ordered. They are{" "}
          <strong>never</strong> sold, shared with advertisers, used to train models, or used for
          any other purpose.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>How long we keep things</h2>
        <ul style={p}>
          <li>
            <strong>Source selfies: deleted automatically right after your headshots are
            delivered.</strong> They are not archived.
          </li>
          <li>
            <strong>Finished headshots:</strong> kept for 30 days so you can re-download them,
            then deleted automatically.
          </li>
          <li>
            <strong>Order records</strong> (name, email, pack, payment reference): kept as long as
            needed for tax, accounting, and fraud-prevention obligations.
          </li>
        </ul>
      </section>

      <section style={section}>
        <h2 style={h2}>Deletion on request</h2>
        <p style={p}>
          You can ask us to delete your photos and personal data at any time — including{" "}
          <em>before</em> delivery (which cancels the order and triggers a full refund). Email{" "}
          {contact ? <strong>{contact}</strong> : "our support email"} with your order number and
          we&apos;ll confirm deletion within 72 hours.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>Security</h2>
        <p style={p}>
          Uploads travel over HTTPS and are stored in private cloud storage with access limited
          to the generation pipeline. No selfie is ever publicly accessible — the generation
          provider receives them through signed, expiring URLs.
        </p>
      </section>

      <section style={section}>
        <h2 style={h2}>Your rights</h2>
        <p style={p}>
          Depending on where you live, you may have the right to access, correct, or delete your
          personal data, and to withdraw consent for biometric processing. Email us (above) and
          we&apos;ll honor it.
        </p>
      </section>

      <p style={{ color: "#64748b", fontSize: 14, marginTop: 32 }}>
        <a href="/" style={link}>← Back to order</a>
        {" · "}
        <a href="/refund-policy" style={link}>Refund Policy</a>
      </p>
    </>
  );
}

const section: React.CSSProperties = { marginTop: 24 };
const h2: React.CSSProperties = { fontSize: 20, marginBottom: 8 };
const p: React.CSSProperties = { color: "#cbd5e1", lineHeight: 1.6 };
const link: React.CSSProperties = { color: "#38bdf8" };
