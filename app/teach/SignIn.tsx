"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// One code, no password. It arrives by email or text from NeuroBridge and works
// for every learner the teacher is assigned to.

export default function SignIn() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkNote, setLinkNote] = useState<string | null>(null);
  const [devLink, setDevLink] = useState<string | null>(null);

  // Ask for a one-time link instead of remembering a code. The reply is the same
  // whether or not we know the address, so this never reveals who teaches whom.
  async function requestLink() {
    setLinkBusy(true);
    setLinkNote(null);
    setDevLink(null);
    const r = await fetch("/api/teach-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    const d = await r.json();
    setLinkBusy(false);
    if (d.error) return setLinkNote(d.error);
    setLinkNote(d.message ?? "Check your email for the link.");
    if (d.link) setDevLink(d.link);
  }
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
      <div className="card" style={{ marginTop: 16 }}>
        <p className="lbl" style={{ marginBottom: 6 }}>Or get a link by email</p>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.85rem" }}>
          No code to keep track of — we&apos;ll email you a link that signs you in. Use the address the
          family added you with.
        </p>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <input
            className="field"
            style={{ flex: 1, minWidth: 200 }}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            onKeyDown={(e) => e.key === "Enter" && void requestLink()}
          />
          <button className="btn quiet" onClick={requestLink} disabled={linkBusy || !email.trim()}>
            {linkBusy ? "…" : "Email me a link"}
          </button>
        </div>
        {linkNote && (
          <p className="muted" role="status" style={{ fontSize: "0.85rem", marginBottom: 0 }}>
            {linkNote}
          </p>
        )}
        {devLink && (
          <p style={{ fontSize: "0.85rem", marginBottom: 0 }}>
            <a href={devLink}>Open the sign-in link →</a>
          </p>
        )}
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        Neither working? Ask the family that hired you to check the address they used.
      </p>
    </main>
  );
}
