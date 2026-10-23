"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

/**
 * Checkout for the paid full Stoic Birth Chart ($27 one-time).
 *
 * The user reaches this page from the DM upsell ("FULL"). It collects the two
 * details the free flow intentionally skipped — exact birth time and birthplace
 * — along with the birth date, then starts a Stripe Checkout session. The
 * `sign` and `flow` query params come from the DM link so the payment can be
 * linked back to the conversation.
 *
 * Consent-first: zero pressure, and the free reading remains free.
 */

function CheckoutForm() {
  const searchParams = useSearchParams();
  const sign = searchParams.get("sign") ?? "";
  const flowId = searchParams.get("flow") ?? "";

  const [email, setEmail] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthplace, setBirthplace] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    if (!birthDate) {
      setError("Please enter your birth date.");
      return;
    }
    if (!birthTime) {
      setError("Please enter your exact birth time (as close as you know it).");
      return;
    }
    if (!birthplace.trim()) {
      setError("Please enter your birthplace (city and country).");
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch("/api/birthday-reading/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          birthDate,
          birthTime,
          birthplace: birthplace.trim(),
          sign: sign || undefined,
          flowId: flowId || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Could not start checkout.");
      if (data.url) {
        // Stripe Checkout redirects back to the success route on payment.
        window.location.href = data.url;
      } else {
        setError("Checkout is not configured yet. Please try again later.");
      }
    } catch (err: any) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: "0 auto", padding: "2rem 1.25rem" }}>
      <a
        href="/"
        style={{ color: "#8a6d3b", textDecoration: "none", fontSize: 14 }}
      >
        ← Back
      </a>

      <div style={{ marginTop: "1.25rem" }}>
        <div style={{ fontSize: 13, color: "#8a6d3b", letterSpacing: 1.5 }}>
          THE STOIC BIRTH CHART
        </div>
        <h1 style={{ fontSize: 26, margin: "0.35rem 0 0.25rem", lineHeight: 1.2 }}>
          Your full, timed chart
        </h1>
        <p style={{ color: "#555", lineHeight: 1.6, marginTop: "0.6rem" }}>
          The free reading used your zodiac sign alone. This deeper symbolic
          chart adds your <strong>exact birth time</strong> and{" "}
          <strong>birthplace</strong> — the two details that place the planets
          in your personal sky — and reveals the timing of your life&apos;s key
          cycles: when to act, when to prepare, which virtue each season asks of
          you.
        </p>
        <ul style={{ fontSize: 14, color: "#444", lineHeight: 1.8, paddingLeft: "1.1rem" }}>
          <li>One-time price: <strong>$27</strong></li>
          <li>~12-page symbolic reading, PDF you keep forever</li>
          <li>Reflective by nature — never a fixed destiny</li>
        </ul>
      </div>

      <form
        onSubmit={handleSubmit}
        style={{ marginTop: "1.5rem", display: "grid", gap: "0.9rem" }}
      >
        <label style={{ display: "grid", gap: "0.3rem", fontSize: 14 }}>
          Email address
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            required
            style={inputStyle}
          />
        </label>

        <label style={{ display: "grid", gap: "0.3rem", fontSize: 14 }}>
          Birth date
          <input
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            style={inputStyle}
          />
        </label>

        <div style={{ display: "grid", gap: "0.9rem", gridTemplateColumns: "1fr 1fr" }}>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: 14 }}>
            Exact birth time
            <input
              type="time"
              value={birthTime}
              onChange={(e) => setBirthTime(e.target.value)}
              required
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: "0.3rem", fontSize: 14 }}>
            Birthplace
            <input
              type="text"
              value={birthplace}
              onChange={(e) => setBirthplace(e.target.value)}
              placeholder="City, Country"
              required
              style={inputStyle}
            />
          </label>
        </div>

        <p style={{ fontSize: 12, color: "#777", margin: 0 }}>
          You&apos;ll pay securely via Stripe. Your card details never touch our
          servers. Contacting you later requires your separate permission —
          your free copy stays free whether or not you continue.
        </p>

        {error && (
          <p style={{ color: "#b00020", fontSize: 14, margin: 0 }}>{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            marginTop: "0.25rem",
            background: "#1a1a1a",
            color: "#fff",
            border: "none",
            borderRadius: 8,
            padding: "0.85rem 1rem",
            fontSize: 16,
            cursor: loading ? "wait" : "pointer",
          }}
        >
          {loading ? "Redirecting to secure payment…" : `Unlock my full chart — $27`}
        </button>
      </form>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  border: "1px solid #ccc",
  borderRadius: 8,
  padding: "0.65rem 0.75rem",
  fontSize: 15,
  width: "100%",
  boxSizing: "border-box",
};

export default function CheckoutPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>}>
      <CheckoutForm />
    </Suspense>
  );
}