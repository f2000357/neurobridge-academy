"use client";

import { useState } from "react";

// Set or change your own password. A user who already has one must confirm it.
export default function ChangePassword({ hasPassword }: { hasPassword: boolean }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNote(null);
    if (next !== confirm) {
      setError("The two new passwords don't match.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "changePassword", currentPassword: current, newPassword: next }),
    });
    const data = await res.json();
    setBusy(false);
    if (!data.ok) {
      setError(data.error ?? "Could not change your password.");
      return;
    }
    setCurrent("");
    setNext("");
    setConfirm("");
    setNote("Password updated.");
  }

  return (
    <form className="card" style={{ marginTop: 18 }} onSubmit={submit}>
      {hasPassword && (
        <>
          <label className="lbl" htmlFor="current">Current password</label>
          <input
            id="current"
            className="field"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </>
      )}
      <label className="lbl" htmlFor="next" style={{ marginTop: 12 }}>New password</label>
      <input
        id="next"
        className="field"
        type="password"
        autoComplete="new-password"
        value={next}
        onChange={(e) => setNext(e.target.value)}
      />
      <label className="lbl" htmlFor="confirm" style={{ marginTop: 12 }}>Confirm new password</label>
      <input
        id="confirm"
        className="field"
        type="password"
        autoComplete="new-password"
        value={confirm}
        onChange={(e) => setConfirm(e.target.value)}
      />
      {error && (
        <p role="alert" style={{ color: "var(--bad, #a1453b)", fontSize: "0.9rem", marginTop: 10 }}>{error}</p>
      )}
      {note && <p className="muted" style={{ marginTop: 10 }}>{note}</p>}
      <button className="btn" style={{ marginTop: 14 }} disabled={busy || !next || !confirm}>
        {busy ? "Saving…" : hasPassword ? "Change password" : "Set password"}
      </button>
    </form>
  );
}
