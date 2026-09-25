"use client";

/**
 * Order page: pack picker + selfie upload (10–15 files) → creates order →
 * redirects to Stripe Checkout.
 *
 * This is a functional scaffold, not the final marketing design
 * (a separate marketing page is being built elsewhere).
 */

import { useState } from "react";

const PACK_OPTIONS = [
  { id: "basic", label: "Basic", price: "$29", detail: "40 headshots · 5 styles" },
  { id: "standard", label: "Standard", price: "$49", detail: "100 headshots · 8 styles" },
  { id: "executive", label: "Executive", price: "$79", detail: "200 headshots · all styles" },
];

export default function OrderPage() {
  const [pack, setPack] = useState("standard");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      // 1. Create the order with uploads.
      const form = new FormData();
      form.append("name", name);
      form.append("email", email);
      form.append("pack", pack);
      for (const f of Array.from(files!)) form.append("selfies", f);

      const orderRes = await fetch("/api/order", { method: "POST", body: form });
      const orderData = await orderRes.json();
      if (!orderRes.ok) throw new Error(orderData.error ?? "Order creation failed.");

      // 2. Create the Stripe Checkout session and redirect.
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
      <h1 style={{ fontSize: 32, marginBottom: 8 }}>Get your AI headshots</h1>
      <p style={{ color: "#94a3b8", marginTop: 0 }}>
        Upload 10–15 clear selfies. We&apos;ll generate studio-quality headshots and email them to you.
      </p>

      <form onSubmit={submit} style={{ display: "grid", gap: 16, marginTop: 24 }}>
        <div style={{ display: "grid", gap: 8 }}>
          {PACK_OPTIONS.map((p) => (
            <label
              key={p.id}
              style={{
                display: "flex", gap: 12, alignItems: "center",
                border: pack === p.id ? "2px solid #38bdf8" : "1px solid #334155",
                borderRadius: 8, padding: 12, cursor: "pointer",
              }}
            >
              <input
                type="radio" name="pack" value={p.id}
                checked={pack === p.id} onChange={() => setPack(p.id)}
              />
              <div>
                <strong>{p.label} — {p.price}</strong>
                <div style={{ color: "#94a3b8", fontSize: 14 }}>{p.detail}</div>
              </div>
            </label>
          ))}
        </div>

        <input
          required placeholder="Your name" value={name}
          onChange={(e) => setName(e.target.value)} style={inputStyle}
        />
        <input
          required type="email" placeholder="Email for delivery" value={email}
          onChange={(e) => setEmail(e.target.value)} style={inputStyle}
        />

        <label style={{ ...inputStyle, cursor: "pointer" }}>
          {files?.length ? `${files.length} selfies selected` : "Choose 10–15 selfies (JPG/PNG/WebP, ≤10 MB each)"}
          <input
            type="file" accept="image/jpeg,image/png,image/webp" multiple
            onChange={(e) => setFiles(e.target.files)}
            style={{ display: "none" }}
          />
        </label>

        {error && <div style={{ color: "#f87171" }}>{error}</div>}

        <button type="submit" disabled={busy} style={buttonStyle}>
          {busy ? "Working…" : "Continue to payment"}
        </button>
      </form>

      <footer style={{ marginTop: 32, paddingTop: 16, borderTop: "1px solid #1e293b", fontSize: 13, color: "#64748b" }}>
        <a href="/refund-policy" style={footerLink}>Refund Policy</a>
        {" · "}
        <a href="/privacy" style={footerLink}>Privacy Policy</a>
        <div style={{ marginTop: 8 }}>
          Your selfies are used only to generate your headshots and are deleted after delivery.
        </div>
      </footer>
    </>
  );
}

const inputStyle: React.CSSProperties = {
  background: "#1e293b", color: "#f1f5f9", border: "1px solid #334155",
  borderRadius: 8, padding: 12, fontSize: 16, width: "100%",
};

const buttonStyle: React.CSSProperties = {
  background: "#38bdf8", color: "#0f172a", border: "none",
  borderRadius: 8, padding: 14, fontSize: 18, fontWeight: 700, cursor: "pointer",
};

const footerLink: React.CSSProperties = { color: "#38bdf8" };
