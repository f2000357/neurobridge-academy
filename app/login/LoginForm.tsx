"use client";

import { useState } from "react";

// Email + password sign-in for guides, center admins, and Neurable admins.
export default function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "login", email, password }),
    });
    const data = await res.json();
    if (data.ok) {
      window.location.href = data.home ?? "/";
      return;
    }
    setBusy(false);
    setError(data.error ?? "Could not sign in.");
  }

  return (
    <main className="page wrap" style={{ maxWidth: 420 }}>
      <p className="eyebrow">Neurable</p>
      <h1>Sign in</h1>
      <p className="muted">For guides, centre admins, and Neurable admins.</p>
      <form className="card" style={{ marginTop: 18 }} onSubmit={submit}>
        <label className="lbl" htmlFor="email">Email</label>
        <input
          id="email"
          className="field"
          type="email"
          autoComplete="username"
          autoCapitalize="none"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <label className="lbl" htmlFor="password" style={{ marginTop: 12 }}>Password</label>
        <input
          id="password"
          className="field"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && (
          <p role="alert" style={{ color: "var(--bad, #a1453b)", fontSize: "0.9rem", marginTop: 10 }}>
            {error}
          </p>
        )}
        <button className="btn" style={{ marginTop: 14 }} disabled={busy || !email || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        No password yet? Ask your centre or Neurable admin to set one up for you.
      </p>
    </main>
  );
}
