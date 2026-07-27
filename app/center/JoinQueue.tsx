"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// Families waiting on an answer from this centre.
//
// Sits at the top of the console because a family that has asked is waiting on
// a person, and a queue nobody sees is a queue nobody clears. Declining asks for
// a reason — it goes back to the parent, and "no" without a word is the thing
// families remember about institutions.

export type JoinRow = {
  id: string;
  childName: string;
  childAge: number | null;
  gradeLevel: string;
  parentName: string;
  message: string;
  createdAt: string;
};

export default function JoinQueue({ rows }: { rows: JoinRow[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!rows.length) return null;

  async function decide(requestId: string, approve: boolean) {
    setBusy(requestId);
    setError(null);
    const res = await fetch("/api/center-join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "decide", requestId, approve, note: approve ? "" : note }),
    });
    const d = await res.json();
    setBusy(null);
    if (d.error) return setError(d.error);
    setDeclining(null);
    setNote("");
    router.refresh();
  }

  return (
    <section className="card lift" style={{ marginTop: 16, borderLeft: "4px solid var(--warn)" }}>
      <h2 style={{ marginTop: 0 }}>
        Families waiting{" "}
        <span className="pill warn" style={{ marginLeft: 6 }}>
          {rows.length}
        </span>
      </h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Each of these parents asked to join. Nothing happens until you answer.
      </p>

      <div className="join-queue">
        {rows.map((r) => (
          <div key={r.id} className="join-row">
            <div className="join-who">
              <p className="join-name">
                {r.childName}
                {r.childAge != null && <span className="muted"> · age {r.childAge}</span>}
                {r.gradeLevel && <span className="muted"> · grade {r.gradeLevel}</span>}
              </p>
              <p className="join-meta">
                Asked by {r.parentName} on {r.createdAt}
              </p>
              {r.message && <p className="join-msg">&ldquo;{r.message}&rdquo;</p>}
            </div>

            {declining === r.id ? (
              <div className="join-decline">
                <input
                  className="field"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={400}
                  placeholder="A short reason — the parent sees this"
                  autoFocus
                />
                <div className="row" style={{ gap: 8, marginTop: 8 }}>
                  <button className="btn" disabled={busy === r.id} onClick={() => decide(r.id, false)}>
                    {busy === r.id ? "Sending…" : "Send decline"}
                  </button>
                  <button
                    className="btn quiet"
                    onClick={() => {
                      setDeclining(null);
                      setNote("");
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="join-actions">
                <button className="btn" disabled={busy === r.id} onClick={() => decide(r.id, true)}>
                  {busy === r.id ? "…" : "Accept"}
                </button>
                <button className="btn quiet" onClick={() => setDeclining(r.id)}>
                  Decline
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
          {error}
        </p>
      )}
    </section>
  );
}
