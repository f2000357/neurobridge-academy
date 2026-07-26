"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export type PersonRow = {
  userId: string;
  name: string;
  email: string;
  role: "primary_guide" | "guide";
  expiresAt: string | null;
  lapsed: boolean;
};

export type HistoryRow = {
  id: string;
  actorName: string;
  label: string;
  detail: string;
  before: string;
  after: string;
  at: string;
};

const when = (iso: string) => {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
};
const day = (iso: string) => {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return iso;
  }
};

// Everyone who may manage this learner. Guides are equals for day-to-day work;
// only the primary guide can change who is here, so this whole section is
// read-only for everybody else.
export default function People({
  childId,
  childName,
  people,
  history,
  canManageAccess,
  meUserId,
}: {
  childId: string;
  childName: string;
  people: PersonRow[];
  history: HistoryRow[];
  canManageAccess: boolean;
  meUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [until, setUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const post = async (body: Record<string, unknown>) => {
    setBusy(true);
    setNote(null);
    const r = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ childId, ...body }),
    });
    const data = await r.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return null;
    }
    router.refresh();
    return data;
  };

  async function invite() {
    const data = await post({ op: "invite", email: email.trim(), expiresAt: until || null });
    if (data) {
      setNote(`${data.name} can now manage ${childName}.`);
      setEmail("");
      setUntil("");
    }
  }

  async function remove(p: PersonRow) {
    if (!confirm(`Remove ${p.name}'s access to ${childName}?`)) return;
    const data = await post({ op: "remove", userId: p.userId });
    if (data) {
      setNote(
        data.freedBlocks
          ? `${p.name} removed. ${data.freedBlocks} upcoming block(s) they held now need cover.`
          : `${p.name} removed.`
      );
    }
  }

  async function makePrimary(p: PersonRow) {
    if (!confirm(`Hand the primary guide role to ${p.name}? You'll stay on as a guide.`)) return;
    const data = await post({ op: "transferPrimary", userId: p.userId });
    if (data) setNote(`${p.name} is now the primary guide.`);
  }

  async function stepAway() {
    if (!confirm(`Stop managing ${childName}? You'll lose access until someone adds you back.`)) return;
    const data = await post({ op: "selfOffboard" });
    if (data) router.push("/teacher/settings");
  }

  const me = people.find((p) => p.userId === meUserId);
  const iAmPrimary = me?.role === "primary_guide";

  return (
    <section style={{ marginTop: 28 }}>
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
        <h2 style={{ margin: 0 }}>👥 People</h2>
        <button className="chip" onClick={() => setShowHistory((v) => !v)}>
          {showHistory ? "Hide history" : "History"}
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Everyone who can manage {childName}. Guides share the day-to-day work equally; the{" "}
        <strong>primary guide</strong> decides who&apos;s here.
      </p>

      {note && (
        <p className="muted" role="status" style={{ fontSize: "0.85rem" }}>
          {note}
        </p>
      )}

      <div className="stack" style={{ gap: 8 }}>
        {people.map((p) => (
          <div key={p.userId} className="row doc-row" style={{ justifyContent: "space-between", gap: 8 }}>
            <span>
              <strong>{p.name}</strong>
              {p.userId === meUserId && <span className="muted"> (you)</span>}
              <span className={`pill ${p.role === "primary_guide" ? "good" : ""}`} style={{ marginLeft: 8 }}>
                {p.role === "primary_guide" ? "primary guide" : "guide"}
              </span>
              {p.expiresAt && (
                <span className={`pill ${p.lapsed ? "crit" : "warn"}`} style={{ marginLeft: 6 }}>
                  {p.lapsed ? "lapsed" : `until ${day(p.expiresAt)}`}
                </span>
              )}
              {p.email && (
                <span className="muted" style={{ display: "block", fontSize: "0.8rem" }}>
                  {p.email}
                </span>
              )}
            </span>
            <span className="row" style={{ gap: 6 }}>
              {canManageAccess && p.role !== "primary_guide" && (
                <>
                  <button className="chip" onClick={() => makePrimary(p)} disabled={busy}>
                    Make primary
                  </button>
                  <button className="chip danger" onClick={() => remove(p)} disabled={busy}>
                    Remove
                  </button>
                </>
              )}
              {p.userId === meUserId && !iAmPrimary && (
                <button className="chip danger" onClick={stepAway} disabled={busy}>
                  Step away
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      {canManageAccess && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="lbl" style={{ marginBottom: 6 }}>Add someone</p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <input
              className="field"
              style={{ flex: 1, minWidth: 200 }}
              type="email"
              placeholder="their email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void invite()}
            />
            <label className="inline muted">
              Until (optional)
              <input className="field short" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <button className="btn" onClick={invite} disabled={busy || !email.trim()}>
              {busy ? "…" : "Add guide"}
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.78rem", marginTop: 8, marginBottom: 0 }}>
            They need a NeuroBridge account already. Set an &ldquo;until&rdquo; date for a substitute —
            their access lapses on its own. Therapists and other specialists are added under{" "}
            <strong>Teachers</strong> instead; they never get guide access.
          </p>
        </div>
      )}

      {showHistory && (
        <div className="card" style={{ marginTop: 12 }}>
          <p className="lbl" style={{ marginBottom: 6 }}>History</p>
          {history.length === 0 ? (
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              Nothing recorded yet.
            </p>
          ) : (
            <div className="stack" style={{ gap: 4, maxHeight: 320, overflowY: "auto" }}>
              {history.map((h) => (
                <div key={h.id} style={{ fontSize: "0.82rem" }}>
                  <span className="muted" style={{ fontVariantNumeric: "tabular-nums" }}>
                    {when(h.at)}
                  </span>{" "}
                  <strong>{h.actorName}</strong> · {h.label}
                  {h.detail && <span className="muted"> — {h.detail}</span>}
                  {h.before && h.after && (
                    <span className="muted">
                      {" "}
                      ({h.before} → {h.after})
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
