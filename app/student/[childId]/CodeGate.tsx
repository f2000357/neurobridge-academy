"use client";

import { useState } from "react";

export default function CodeGate({ childId, childName }: { childId: string; childName: string }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (code.length < 8) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/child-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, code }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      window.location.reload();
    } else {
      setError(true);
      setCode("");
    }
  }

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            NeuroBridge
          </span>
        </div>
      </header>
      <main className="page wrap" style={{ maxWidth: 460 }}>
        <section className="phase center">
          <p className="eyebrow">Welcome</p>
          <h1>Hi {childName} 👋</h1>
          <p className="muted">Type your 8 numbers to open your day.</p>
          <input
            className="answer codegate-input"
            inputMode="numeric"
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="• • • • • • • •"
            aria-label="Your 8-digit code"
          />
          {error && (
            <p style={{ color: "var(--crit)", fontSize: "0.9rem" }}>
              That code didn&apos;t match. Try again, or ask your grown-up.
            </p>
          )}
          <button className="btn big" onClick={submit} disabled={busy || code.length < 8}>
            {busy ? "Checking…" : "Open my day"}
          </button>
        </section>
      </main>
    </>
  );
}
