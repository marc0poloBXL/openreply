"use client";

import { useState, useCallback } from "react";
import { QUESTIONS, gradeQuiz, type QuizResult } from "@/lib/quiz/questions";

type PageState = "quiz" | "result-preview" | "result-full" | "error";

const ELEMENT_COLORS: Record<string, string> = {
  fire: "#E85D3A",
  earth: "#5A7A4A",
  air: "#4A8BB7",
  water: "#3B82B0",
};

export default function QuizPage() {
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [pageState, setPageState] = useState<PageState>("quiz");
  const [result, setResult] = useState<QuizResult | null>(null);
  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState("");
  const [sending, setSending] = useState(false);

  const currentQ = QUESTIONS[step];
  const progress = (step / QUESTIONS.length) * 100;

  const handleSelect = useCallback(
    (element: string) => {
      const next = [...answers, element];
      setAnswers(next);

      if (next.length >= QUESTIONS.length) {
        const res = gradeQuiz(next);
        setResult(res);
        setPageState("result-preview");
      } else {
        setStep((s) => s + 1);
      }
    },
    [answers]
  );

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setEmailError("");

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailError("Please enter a valid email address.");
      return;
    }

    setSending(true);
    try {
      const resp = await fetch("/api/quiz/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, answers, result }),
      });
      const data = await resp.json();
      if (data.ok) {
        setPageState("result-full");
      } else {
        setEmailError(data.error || "Something went wrong. Try again.");
      }
    } catch {
      setEmailError("Network error. Please check your connection.");
    } finally {
      setSending(false);
    }
  };

  const handleRestart = () => {
    setStep(0);
    setAnswers([]);
    setPageState("quiz");
    setResult(null);
    setEmail("");
    setEmailError("");
  };

  const elementColor = result ? ELEMENT_COLORS[result.element] || "#B8860B" : "#B8860B";
  const elementEmoji: Record<string, string> = {
    fire: "🔥", earth: "🌍", air: "💨", water: "🌊",
  };

  return (
    <div style={{
      minHeight: "100vh",
      background: "#FAF7F2",
      fontFamily: "'Inter', -apple-system, sans-serif",
      color: "#2C2A26",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 20px",
    }}>
      <div style={{ maxWidth: 520, width: "100%" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, textTransform: "uppercase",
            letterSpacing: "0.08em", color: "#8A8176", marginBottom: 8,
          }}>
            @stoiczodiac
          </div>
          <h1 style={{
            fontFamily: "'Cormorant Garamond', Georgia, serif",
            fontSize: 32, fontWeight: 700, color: "#B8860B",
            margin: 0, lineHeight: 1.2,
          }}>
            What&rsquo;s Your<br />Stoic Sign?
          </h1>
          <p style={{ color: "#6B6156", fontSize: 14, marginTop: 8 }}>
            5 questions to find which Stoic philosopher matches your spirit.
          </p>
        </div>

        {/* Quiz Questions */}
        {pageState === "quiz" && (
          <div>
            <div style={{
              height: 4, background: "#E8E0D4", borderRadius: 2,
              marginBottom: 24, overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${progress}%`,
                background: "#B8860B", borderRadius: 2,
                transition: "width 0.3s ease",
              }} />
            </div>

            <div style={{ fontSize: 13, color: "#8A8176", marginBottom: 16 }}>
              Question {step + 1} of {QUESTIONS.length}
            </div>

            <h2 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 22, fontWeight: 600, margin: "0 0 20px", lineHeight: 1.3,
            }}>
              {currentQ.question}
            </h2>

            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentQ.options.map((opt, i) => (
                <button
                  key={i}
                  onClick={() => handleSelect(opt.element)}
                  style={{
                    display: "block", width: "100%", textAlign: "left",
                    padding: "14px 18px", border: "1px solid #D8D0C4",
                    borderRadius: 10, background: "#fff", cursor: "pointer",
                    fontSize: 15, lineHeight: 1.4, color: "#2C2A26",
                  }}
                  onMouseOver={e => {
                    e.currentTarget.style.borderColor = "#B8860B";
                    e.currentTarget.style.boxShadow = "0 0 0 2px rgba(184,134,11,0.15)";
                  }}
                  onMouseOut={e => {
                    e.currentTarget.style.borderColor = "#D8D0C4";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Result Preview — email gate */}
        {pageState === "result-preview" && result && (
          <div style={{
            background: "#fff", borderRadius: 16, padding: "32px 24px",
            border: "1px solid #D8D0C4", textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {elementEmoji[result.element] || "🏛️"}
            </div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 26, fontWeight: 700, margin: "0 0 4px",
            }}>
              You matched with {result.zodiacSign}
            </h2>
            <div style={{
              fontSize: 18, fontWeight: 600, color: elementColor, marginBottom: 4,
            }}>
              {result.stoicMatch} — {result.stoicTitle}
            </div>

            <div style={{
              height: 1, background: "#E8E0D4", margin: "16px 0",
            }} />

            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#6B6156" }}>
              Enter your email to see your full result, a personal Stoic quote,
              and weekly wisdom for your sign.
            </p>

            <form onSubmit={handleEmailSubmit} style={{ marginTop: 16 }}>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                style={{
                  width: "100%", padding: "14px 16px",
                  border: "1px solid #D8D0C4", borderRadius: 10,
                  fontSize: 15, outline: "none",
                  boxSizing: "border-box",
                }}
              />
              {emailError && (
                <div style={{ color: "#DC2626", fontSize: 13, marginTop: 6 }}>
                  {emailError}
                </div>
              )}
              <button
                type="submit"
                disabled={sending}
                style={{
                  width: "100%", marginTop: 12, padding: "14px 24px",
                  background: "#B8860B", color: "#fff", border: "none",
                  borderRadius: 10, fontSize: 15, fontWeight: 600,
                  cursor: sending ? "not-allowed" : "pointer",
                  opacity: sending ? 0.7 : 1,
                }}
              >
                {sending ? "Sending..." : "Show Me My Result"}
              </button>
            </form>
          </div>
        )}

        {/* Full Result */}
        {pageState === "result-full" && result && (
          <div style={{
            background: "#fff", borderRadius: 16, padding: "32px 24px",
            borderTop: `4px solid ${elementColor}`,
            textAlign: "center",
          }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>
              {elementEmoji[result.element] || "🏛️"}
            </div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 28, fontWeight: 700, margin: "0 0 4px", color: elementColor,
            }}>
              {result.zodiacSign}
            </h2>
            <div style={{
              fontFamily: "'Cormorant Garamond', Georgia, serif",
              fontSize: 20, margin: "0 0 4px",
            }}>
              Your Stoic Philosopher: {result.stoicMatch}
            </div>
            <div style={{
              fontSize: 14, fontWeight: 600, color: "#8A8176", marginBottom: 16,
              textTransform: "uppercase", letterSpacing: "0.05em",
            }}>
              {result.element.toUpperCase()}
            </div>

            <div style={{ height: 1, background: "#E8E0D4", margin: "16px 0" }} />

            <p style={{ fontSize: 15, lineHeight: 1.6, color: "#444" }}>
              {result.description}
            </p>

            <div style={{
              background: "#F0F5F0", borderRadius: 10, padding: "20px 16px",
              margin: "16px 0", fontStyle: "italic", fontSize: 15, color: "#4A6B5D",
              lineHeight: 1.5,
            }}>
              {result.quote}
            </div>

            <div style={{ height: 1, background: "#E8E0D4", margin: "16px 0" }} />

            <p style={{ fontSize: 14, color: "#6B6156" }}>
              Share your result and tag <strong>@stoiczodiac</strong> on Instagram!
            </p>

            <button
              onClick={handleRestart}
              style={{
                width: "100%", marginTop: 12, padding: "14px 24px",
                backgound: "#E8E0D4", color: "#2C2A26", border: "1px solid #D8D0C4",
                borderRadius: 10, fontSize: 14, cursor: "pointer",
              }}
            >
              Take the Quiz Again
            </button>
          </div>
        )}

      </div>
    </div>
  );
}
