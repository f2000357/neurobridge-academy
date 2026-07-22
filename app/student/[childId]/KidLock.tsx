"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The only way out of a child's locked session: a grown-up enters the PIN.
export default function KidLock() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setError(false);
    const res = await fetch("/api/parent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "verifyPin", pin }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.ok) {
      router.push("/teacher");
    } else {
      setError(true);
      setPin("");
    }
  }

  return (
    <>
      <button
        className="kidlock-btn"
        onClick={() => {
          setOpen(true);
          setError(false);
          setPin("");
        }}
        aria-label="Exit — grown-ups only"
        title="Exit (grown-ups only)"
      >
        🔒
      </button>

      {open && (
        <div className="kidlock-overlay" role="dialog" aria-modal="true" aria-label="Grown-up exit">
          <div className="kidlock-modal">
            <h2 style={{ marginTop: 0 }}>For grown-ups</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Enter your PIN to leave {" "}
              {typeof window !== "undefined" ? "your child's" : "the"} learning space.
            </p>
            <input
              className="field"
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="PIN"
              aria-label="Parent PIN"
              style={{ textAlign: "center", letterSpacing: "0.4em", fontSize: "1.3rem" }}
            />
            {error && (
              <p style={{ color: "var(--crit)", fontSize: "0.9rem", margin: "8px 0 0" }}>
                That PIN didn&apos;t match. Try again.
              </p>
            )}
            <div className="row" style={{ marginTop: 16, gap: 10 }}>
              <button className="btn" onClick={submit} disabled={busy || pin.length === 0}>
                {busy ? "Checking…" : "Unlock"}
              </button>
              <button className="btn quiet" onClick={() => setOpen(false)} disabled={busy}>
                Stay
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
