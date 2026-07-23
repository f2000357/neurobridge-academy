"use client";

import { useState } from "react";

// The child's front door: their name (username, like "paiyer") and their 8
// numbers. Kept deliberately plain and large for a young or neurodiverse reader.
export default function ChildSignIn() {
  const [username, setUsername] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!username.trim() || code.length < 8) return;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/child-access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: username.trim(), code }),
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = data.redirect;
      return;
    }
    setBusy(false);
    setError(true);
    setCode("");
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
          <h1>Let&apos;s open your day</h1>

          <label className="lbl" htmlFor="username">Your name</label>
          <input
            id="username"
            className="answer codegate-input"
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value.replace(/\s/g, "").toLowerCase())}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="like paiyer"
            aria-label="Your name"
          />

          <label className="lbl" htmlFor="code" style={{ marginTop: 14 }}>Your 8 numbers</label>
          <input
            id="code"
            className="answer codegate-input"
            inputMode="numeric"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            placeholder="• • • • • • • •"
            aria-label="Your 8-digit code"
          />

          {error && (
            <p style={{ color: "var(--crit)", fontSize: "0.9rem" }}>
              That name or code didn&apos;t match. Try again, or ask your grown-up.
            </p>
          )}
          <button
            className="btn big"
            style={{ marginTop: 16 }}
            onClick={submit}
            disabled={busy || !username.trim() || code.length < 8}
          >
            {busy ? "Checking…" : "Open my day"}
          </button>
        </section>
      </main>
    </>
  );
}
