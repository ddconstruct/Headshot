"use client";

/**
 * Top Notch AI Headshots — marketing landing page + order form.
 *
 * Hero / how-it-works / pricing (Buy Now buttons scroll to the order
 * form and preselect the pack) / order form / FAQ / footer.
 */

import { useRef, useState } from "react";

const PACK_OPTIONS = [
  { id: "basic", label: "Basic", price: "$29", detail: "40 headshots · 5 styles", blurb: "A quick professional refresh." },
  { id: "standard", label: "Standard", price: "$49", detail: "100 headshots · 8 styles", blurb: "Our most popular pack." },
  { id: "executive", label: "Executive", price: "$79", detail: "200 headshots · all styles", blurb: "Maximum variety & polish." },
];

const GOLD = "#d9a821";
const GOLD_HOVER = "#e9b93c";
const NAVY = "#0a1120";
const SURFACE = "#101a30";
const TEXT = "#f4f6fb";
const MUTED = "#9aa7bd";

export default function LandingPage() {
  const [pack, setPack] = useState("standard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const orderRef = useRef<HTMLDivElement>(null);

  function buyNow(packId: string) {
    setPack(packId);
    orderRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const count = files?.length ?? 0;
    if (count < 10 || count > 15) {
      setError(`Please select 10–15 selfies (you chose ${count}).`);
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("name", name);
      form.append("email", email);
      form.append("pack", pack);
      for (const f of Array.from(files!)) form.append("selfies", f);
      const orderRes = await fetch("/api/order", { method: "POST", body: form });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error ?? "Order creation failed.");
      const coRes = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: orderData.orderId }),
      });
      const coData = await coRes.json();
      if (!coRes.ok) throw new Error(coData.error ?? "Checkout failed.");
      window.location.href = coData.url;
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <style>{`
        html { scroll-behavior: smooth; }
        .gold-btn { transition: background 0.15s ease, transform 0.15s ease; }
        .gold-btn:hover { background: ${GOLD_HOVER}; transform: translateY(-1px); }
        .card-hover { transition: transform 0.15s ease, border-color 0.15s ease; }
        .card-hover:hover { transform: translateY(-3px); }
        details.faq { border: 1px solid #1e2c4a; border-radius: 10px; padding: 14px 16px; background: ${SURFACE}; }
        details.faq summary { cursor: pointer; font-weight: 600; }
        details.faq p { color: ${MUTED}; margin: 10px 0 0; line-height: 1.6; }
      `}</style>

      <nav style={{ position: "sticky", top: 0, zIndex: 10, background: "rgba(10,17,32,0.92)", backdropFilter: "blur(8px)", borderBottom: "1px solid #1e2c4a" }}>
        <div style={{ maxWidth: 1080, margin: "0 auto", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontWeight: 800, fontSize: 18 }}>
            <span style={{ color: GOLD }}>Top Notch</span> <span style={{ color: TEXT }}>AI Headshots</span>
          </div>
          <a href="#order" className="gold-btn" style={{ ...goldButton, padding: "10px 18px", fontSize: 15, textDecoration: "none" }}>
            Get My Headshots
          </a>
        </div>
      </nav>

      <header style={{ maxWidth: 1080, margin: "0 auto", padding: "72px 20px 56px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "#1a2540", border: `1px solid ${GOLD}`, color: GOLD, borderRadius: 999, padding: "6px 16px", fontSize: 13, fontWeight: 700, letterSpacing: 1, marginBottom: 20 }}>
          ✨ AI-POWERED · NO STUDIO VISIT NEEDED
        </div>
        <h1 style={{ fontSize: "clamp(34px, 6vw, 56px)", lineHeight: 1.1, margin: "0 0 16px", color: TEXT }}>
          Studio-Quality Headshots<br />From Your <span style={{ color: GOLD }}>Selfies</span>
        </h1>
        <p style={{ color: MUTED, fontSize: 19, maxWidth: 640, margin: "0 auto 32px", lineHeight: 1.6 }}>
          Skip the $300 studio sitting. Upload 10–15 everyday phone pics and get polished,
          professional headshots back — perfect for LinkedIn, resumes, real estate listings,
          and business pages.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="#order" className="gold-btn" style={{ ...goldButton, textDecoration: "none" }}>
            Get My Headshots — from $29
          </a>
          <a href="#pricing" style={{ ...ghostButton, textDecoration: "none" }}>
            See Pricing
          </a>
        </div>
        <div style={{ display: "flex", gap: 20, justifyContent: "center", flexWrap: "wrap", marginTop: 32, color: MUTED, fontSize: 14 }}>
          <span>✓ Done from your phone</span>
          <span>✓ No appointment</span>
          <span>✓ Selfies deleted after delivery</span>
        </div>
      </header>

      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 56px" }}>
        <h2 style={sectionTitle}>How it works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { n: "1", t: "Pick your pack", d: "Choose Basic, Standard, or Executive — from just $29." },
            { n: "2", t: "Upload 10–15 selfies", d: "Clear phone pics, different angles, good lighting. Takes two minutes." },
            { n: "3", t: "Get your headshots", d: "We generate studio-style portraits and email them straight to you." },
          ].map((s) => (
            <div key={s.n} style={card}>
              <div style={{ width: 40, height: 40, borderRadius: "50%", background: GOLD, color: NAVY, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, marginBottom: 12 }}>{s.n}</div>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 6, color: TEXT }}>{s.t}</div>
              <div style={{ color: MUTED, fontSize: 14, lineHeight: 1.6 }}>{s.d}</div>
            </div>
          ))}
        </div>
      </section>

      <section id="pricing" style={{ maxWidth: 1080, margin: "0 auto", padding: "24px 20px 64px" }}>
        <h2 style={sectionTitle}>Simple pricing</h2>
        <p style={{ textAlign: "center", color: MUTED, marginTop: -8, marginBottom: 28 }}>One payment. No subscription. Yours to keep forever.</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16, alignItems: "stretch" }}>
          {PACK_OPTIONS.map((p) => {
            const popular = p.id === "standard";
            return (
              <div key={p.id} className="card-hover" style={{ ...card, border: popular ? `2px solid ${GOLD}` : "1px solid #1e2c4a", display: "flex", flexDirection: "column", position: "relative" }}>
                {popular && (
                  <div style={{ position: "absolute", top: -13, left: "50%", transform: "translateX(-50%)", background: GOLD, color: NAVY, fontSize: 12, fontWeight: 800, padding: "3px 14px", borderRadius: 999, letterSpacing: 0.5 }}>
                    MOST POPULAR
                  </div>
                )}
                <div style={{ fontWeight: 700, fontSize: 18, color: TEXT }}>{p.label}</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: GOLD, margin: "8px 0" }}>{p.price}</div>
                <div style={{ color: MUTED, fontSize: 14, marginBottom: 4 }}>{p.detail}</div>
                <div style={{ color: MUTED, fontSize: 14, marginBottom: 20 }}>{p.blurb}</div>
                <button onClick={() => buyNow(p.id)} className="gold-btn" style={{ ...goldButton, width: "100%", marginTop: "auto" }}>
                  Buy Now
                </button>
              </div>
            );
          })}
        </div>
      </section>

      <section style={{ background: SURFACE, borderTop: "1px solid #1e2c4a", borderBottom: "1px solid #1e2c4a" }}>
        <div ref={orderRef} id="order" style={{ maxWidth: 640, margin: "0 auto", padding: "56px 20px", scrollMarginTop: 70 }}>
          <h2 style={{ ...sectionTitle, marginBottom: 8 }}>Get your headshots</h2>
          <p style={{ textAlign: "center", color: MUTED, marginTop: 0, marginBottom: 28 }}>
            Choose your pack, upload your selfies, and check out securely with Stripe.
          </p>
          <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
            <div style={{ display: "grid", gap: 8 }}>
              {PACK_OPTIONS.map((p) => (
                <label key={p.id} style={{
                  display: "flex", gap: 12, alignItems: "center",
                  border: pack === p.id ? `2px solid ${GOLD}` : "1px solid #2a3a5c",
                  borderRadius: 10, padding: 12, cursor: "pointer", background: NAVY,
                }}>
                  <input type="radio" name="pack" value={p.id} checked={pack === p.id} onChange={() => setPack(p.id)} />
                  <div>
                    <strong style={{ color: TEXT }}>{p.label} — {p.price}</strong>
                    <div style={{ color: MUTED, fontSize: 14 }}>{p.detail}</div>
                  </div>
                </label>
              ))}
            </div>
            <input required placeholder="Your name" value={name}
              onChange={(e) => setName(e.target.value)} style={inputStyle} />
            <input required type="email" placeholder="Email for delivery" value={email}
              onChange={(e) => setEmail(e.target.value)} style={inputStyle} />
            <label style={{ ...inputStyle, cursor: "pointer", textAlign: "center" }}>
              {files?.length ? `${files.length} selfies selected ✓` : "Choose 10–15 selfies (JPG/PNG/WebP, ≤10 MB each)"}
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple
                onChange={(e) => setFiles(e.target.files)} style={{ display: "none" }} />
            </label>
            {error && <div style={{ color: "#f87171" }}>{error}</div>}
            <button type="submit" disabled={busy} className="gold-btn" style={{ ...goldButton, opacity: busy ? 0.7 : 1 }}>
              {busy ? "Working…" : "Continue to Payment →"}
            </button>
            <div style={{ textAlign: "center", color: MUTED, fontSize: 13 }}>🔒 Secure checkout via Stripe</div>
          </form>
        </div>
      </section>

      <section style={{ maxWidth: 720, margin: "0 auto", padding: "56px 20px" }}>
        <h2 style={sectionTitle}>Questions, answered</h2>
        <div style={{ display: "grid", gap: 12, marginTop: 24 }}>
          <details className="faq">
            <summary>How long until I get my headshots?</summary>
            <p>We start generating right after checkout and email your headshots as soon as they&apos;re ready.</p>
          </details>
          <details className="faq">
            <summary>What kind of selfies should I upload?</summary>
            <p>Clear, well-lit photos of your face from slightly different angles. Skip sunglasses, hats, and heavy filters — better input means better headshots.</p>
          </details>
          <details className="faq">
            <summary>What will my headshots look like?</summary>
            <p>Professional studio-style portraits — business attire, clean neutral backgrounds — generated from your selfies.</p>
          </details>
          <details className="faq">
            <summary>Is my data private?</summary>
            <p>Yes. Your selfies are used only to generate your headshots and are deleted after delivery.</p>
          </details>
          <details className="faq">
            <summary>What if I don&apos;t like them?</summary>
            <p>Check our <a href="/refund-policy" style={{ color: GOLD }}>refund policy</a> for the details.</p>
          </details>
        </div>
      </section>

      <footer style={{ borderTop: "1px solid #1e2c4a", padding: "28px 20px", textAlign: "center", color: MUTED, fontSize: 13 }}>
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          <span style={{ color: GOLD }}>Top Notch</span> <span style={{ color: TEXT }}>AI Headshots</span>
        </div>
        <div style={{ marginBottom: 8 }}>
          <a href="/refund-policy" style={footerLink}>Refund Policy</a>
          {" · "}
          <a href="/privacy" style={footerLink}>Privacy Policy</a>
        </div>
        <div>Questions? Call or text 937-303-7003</div>
        <div style={{ marginTop: 8 }}>© 2026 Top Notch AI Headshots. All rights reserved.</div>
      </footer>
    </>
  );
}

const goldButton: React.CSSProperties = {
  background: GOLD, color: NAVY, border: "none", borderRadius: 10,
  padding: "14px 28px", fontSize: 17, fontWeight: 800, cursor: "pointer",
  display: "inline-block",
};

const ghostButton: React.CSSProperties = {
  background: "transparent", color: TEXT, border: "1px solid #2a3a5c",
  borderRadius: 10, padding: "14px 28px", fontSize: 17, fontWeight: 700, cursor: "pointer",
  display: "inline-block",
};

const sectionTitle: React.CSSProperties = {
  textAlign: "center", fontSize: 30, color: TEXT, marginBottom: 28,
};

const card: React.CSSProperties = {
  background: SURFACE, border: "1px solid #1e2c4a", borderRadius: 14, padding: 24,
};

const inputStyle: React.CSSProperties = {
  background: NAVY, color: TEXT, border: "1px solid #2a3a5c",
  borderRadius: 10, padding: 13, fontSize: 16, width: "100%",
};

const footerLink: React.CSSProperties = { color: GOLD };
