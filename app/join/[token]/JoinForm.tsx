"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function JoinForm({
  token,
  email,
  name: invitedName,
  hasAccount,
}: {
  token: string;
  email: string;
  name: string;
  hasAccount: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(invitedName);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setError(null);
    if (!hasAccount && !name.trim()) return setError("What should we call you?");
    if (password.length < 8) return setError("Use a password of at least 8 characters.");
    setBusy(true);
    const r = await fetch("/api/join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, name: name.trim(), password }),
    });
    const d = await r.json();
    setBusy(false);
    if (d.error) return setError(d.error);
    router.push("/teacher");
    router.refresh();
  }

  return (
    <div className="stack">
      {error && (
        <p className="muted" role="alert" style={{ color: "var(--slot-break)", fontSize: "0.88rem" }}>
          {error}
        </p>
      )}
      <label className="lbl">Email</label>
      <input className="field" value={email} readOnly disabled />
      {!hasAccount && (
        <>
          <label className="lbl">Your name</label>
          <input className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </>
      )}
      <label className="lbl">{hasAccount ? "Your password" : "Choose a password"}</label>
      <input
        className="field"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder={hasAccount ? "" : "at least 8 characters"}
        onKeyDown={(e) => e.key === "Enter" && void accept()}
      />
      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn" onClick={accept} disabled={busy}>
          {busy ? "…" : hasAccount ? "Sign in and accept" : "Accept and get started"}
        </button>
      </div>
    </div>
  );
}
