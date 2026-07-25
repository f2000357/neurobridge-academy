"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One code, no password. It arrives by email or text from NeuroBridge and works
// for every learner the teacher is assigned to.

export default function SignIn() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/teach", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "signIn", code }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "That code isn't recognised.");
      return;
    }
    router.refresh();
  }

  return (
    <main className="page wrap teach-wrap">
      <p className="eyebrow">NeuroBridge</p>
      <h1>Teacher notes</h1>
      <p className="muted">
        Enter the code that was sent to you. It opens the learners you teach, so you can read their
        work and leave notes for the family.
      </p>
      <form className="card" style={{ marginTop: 18 }} onSubmit={submit}>
        <label className="lbl" htmlFor="code">
          Your teacher code
        </label>
        <input
          id="code"
          className="field code-field"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="T12345678"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          spellCheck={false}
        />
        {error && (
          <p className="muted" role="alert" style={{ color: "var(--bad, #a1453b)" }}>
            {error}
          </p>
        )}
        <button className="btn" style={{ marginTop: 12 }} disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Open my learners"}
        </button>
      </form>
      <p className="muted" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        Don&apos;t have a code? Ask the family or centre that hired you — they can have NeuroBridge send
        it to you.
      </p>
    </main>
  );
}
