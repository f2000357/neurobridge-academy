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
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [canInvite, setCanInvite] = useState(false);
  const [found, setFound] = useState<{
    userId: string;
    name: string;
    accountRole: string;
    center: string | null;
    already: string | null;
  } | null>(null);

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

  // Two steps on purpose: a mistyped address that matches a different real
  // account would otherwise hand a stranger this child's IEP. You confirm a
  // NAME, not an email you typed.
  async function lookup() {
    setBusy(true);
    setNote(null);
    setFound(null);
    const r = await fetch("/api/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "lookup", childId, email: email.trim() }),
    });
    const data = await r.json();
    setBusy(false);
    if (data.error) return setNote(data.error);
    if (!data.found) {
      setNote(data.message);
      setCanInvite(Boolean(data.canInvite));
      return;
    }
    setCanInvite(false);
    setFound(data);
  }

  /** No account with that address — send them an invitation to make one. */
  async function sendInvitation() {
    const data = await post({ op: "invite", email: email.trim() });
    if (data?.invited) {
      setInviteLink(window.location.origin + data.link);
      setNote(`Invitation ready for ${data.email} — send them the link below.`);
      setCanInvite(false);
      setEmail("");
    }
  }

  async function confirmInvite() {
    if (!found) return;
    const data = await post({ op: "invite", userId: found.userId, expiresAt: until || null });
    if (data) {
      // No account yet -> an invitation was created. Email delivery is not built,
      // so surface the link for the parent to pass on.
      if (data.invited) {
        setInviteLink(window.location.origin + data.link);
        setNote(`Invitation ready for ${data.email} — send them the link below.`);
      } else {
        setNote(`${data.name} can now manage ${childName}.`);
      }
      setEmail("");
      setUntil("");
      setFound(null);
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
              onChange={(e) => {
                setEmail(e.target.value);
                setFound(null);
                setCanInvite(false);
              }}
              onKeyDown={(e) => e.key === "Enter" && void lookup()}
            />
            <label className="inline muted">
              Until (optional)
              <input className="field short" type="date" value={until} onChange={(e) => setUntil(e.target.value)} />
            </label>
            <button className="btn quiet" onClick={lookup} disabled={busy || !email.trim()}>
              {busy ? "…" : "Look up"}
            </button>
          </div>

          {found && (
            <div className="card" style={{ marginTop: 10, background: "var(--accent-soft)" }}>
              {found.already ? (
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  <strong>{found.name}</strong> already manages {childName} as{" "}
                  {found.already === "primary_guide" ? "the primary guide" : "a guide"}
                  {until ? " — adding again will update when their access lapses." : "."}
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: "0.9rem" }}>
                  Give <strong>{found.name}</strong>
                  {found.center ? ` (${found.center})` : ""} full access to {childName} — schedule,
                  lessons, points, and their IEP?
                </p>
              )}
              <div className="row" style={{ gap: 8, marginTop: 10 }}>
                <button className="btn" onClick={confirmInvite} disabled={busy}>
                  {busy ? "…" : found.already ? "Update access" : `Yes, add ${found.name}`}
                </button>
                <button className="btn quiet" onClick={() => setFound(null)} disabled={busy}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {canInvite && (
            <div className="row" style={{ marginTop: 10, gap: 8 }}>
              <button className="btn" onClick={sendInvitation} disabled={busy}>
                {busy ? "…" : "Send them an invitation"}
              </button>
              <button className="btn quiet" onClick={() => setCanInvite(false)} disabled={busy}>
                Cancel
              </button>
            </div>
          )}

          {inviteLink && (
            <div className="card" style={{ marginTop: 10, background: "var(--warm-soft)" }}>
              <p className="lbl" style={{ marginBottom: 4 }}>Invitation link</p>
              <input className="field" readOnly value={inviteLink} onFocus={(e) => e.target.select()} />
              <p className="muted" style={{ fontSize: "0.78rem", marginTop: 6, marginBottom: 0 }}>
                Send this to them however you like — email isn&apos;t wired up yet. It works once and
                expires in 14 days.
              </p>
            </div>
          )}

          <p className="muted" style={{ fontSize: "0.78rem", marginTop: 8, marginBottom: 0 }}>
            You confirm a name, not an address — a mistyped email can&apos;t quietly give the wrong
            person access. Inviting never creates an account: they need one already (a centre or
            NeuroBridge admin can set one up). Set an &ldquo;until&rdquo; date for a substitute and their
            access lapses on its own. Therapists are added under <strong>Teachers</strong> instead;
            they never get guide access.
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
