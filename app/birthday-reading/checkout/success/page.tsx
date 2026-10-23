"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Shown after Stripe Checkout returns. Calls the completion route once to
 * finalize the order (idempotent), then displays the paid status + PDF link.
 */

function SuccessBody() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("session_id") ?? "";
  const paymentId = searchParams.get("payment") ?? "";

  const [status, setStatus] = useState<"working" | "paid" | "pending" | "error">(
    "working"
  );
  const [pdfUrl, setPdfUrl] = useState("");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (!paymentId) {
      setStatus("error");
      setErrorMsg("Missing payment reference.");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const resp = await fetch("/api/birthday-reading/payment/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, paymentId }),
        });
        const data = await resp.json();
        if (cancelled) return;
        if (data.ok) {
          setStatus("paid");
          setPdfUrl(data.pdfUrl ?? "");
        } else {
          setStatus("pending");
          setErrorMsg(data.error || "Your payment could not be confirmed.");
        }
      } catch {
        if (!cancelled) {
          setStatus("pending");
          setErrorMsg("We could not confirm your payment just now.");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [sessionId, paymentId]);

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", padding: "3rem 1.25rem", textAlign: "center" }}>
      {status === "working" && (
        <>
          <div style={{ fontSize: 40 }}>✨</div>
          <h1 style={{ fontSize: 24, margin: "0.75rem 0" }}>Confirming your chart…</h1>
          <p style={{ color: "#555" }}>One moment while we finish your reading.</p>
        </>
      )}

      {status === "paid" && (
        <>
          <div style={{ fontSize: 40 }}>🦁</div>
          <h1 style={{ fontSize: 24, margin: "0.75rem 0" }}>Your full chart is ready</h1>
          <p style={{ color: "#555", lineHeight: 1.6 }}>
            Your full Stoic Birth Chart — built from your exact birth time and
            birthplace — has been prepared and emailed to you.
          </p>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              style={{
                display: "inline-block",
                marginTop: "1rem",
                background: "#1a1a1a",
                color: "#fff",
                padding: "0.75rem 1.25rem",
                borderRadius: 8,
                textDecoration: "none",
                fontWeight: 600,
              }}
            >
              Download your PDF
            </a>
          )}
          <p style={{ color: "#888", fontSize: 12, marginTop: "1.5rem" }}>
            Reflective by nature — your choices shape what comes next.
          </p>
        </>
      )}

      {status === "pending" && (
        <>
          <div style={{ fontSize: 40 }}>⏳</div>
          <h1 style={{ fontSize: 24, margin: "0.75rem 0" }}>Almost there</h1>
          <p style={{ color: "#555", lineHeight: 1.6 }}>
            {errorMsg} Your order is recorded and will be completed as soon as
            the payment confirms — check your email in a few minutes.
          </p>
        </>
      )}

      {status === "error" && (
        <>
          <div style={{ fontSize: 40 }}>💛</div>
          <h1 style={{ fontSize: 24, margin: "0.75rem 0" }}>Something went wrong</h1>
          <p style={{ color: "#555" }}>{errorMsg}</p>
        </>
      )}
    </div>
  );
}

export default function CheckoutSuccessPage() {
  return (
    <Suspense fallback={<div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>}>
      <SuccessBody />
    </Suspense>
  );
}