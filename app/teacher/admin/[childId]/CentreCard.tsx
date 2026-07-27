"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// A family's relationship with a centre, from the family's side.
//
// Three states, one card: not in a centre (browse and ask), waiting on an
// answer (withdraw), in one (leave). The parent drives all of it — a centre can
// only answer, never enrol.

export type CentreOption = { id: string; name: string; region: string };
export type CentreState = {
  childId: string;
  childName: string;
  member: { id: string; name: string; region: string } | null;
  pending: { id: string; centerName: string; createdAt: string } | null;
  lastDecision: { status: string; centerName: string; note: string; decidedAt: string } | null;
  options: CentreOption[];
  canAct: boolean;
  primaryGuideName: string | null;
};

export default function CentreCard({ state }: { state: CentreState }) {
  const router = useRouter();
  const [centerId, setCenterId] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const first = state.childName.split(" ")[0] || "your child";

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/center-join", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const d = await res.json();
    setBusy(false);
    if (d.error) {
      setError(d.error);
      return false;
    }
    router.refresh();
    return true;
  }

  return (
    <div className="card" style={{ marginTop: 12 }}>
      <h2>Centre</h2>

      {/* ── already a member ── */}
      {state.member ? (
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {first} is part of <strong>{state.member.name}</strong>
            {state.member.region ? ` · ${state.member.region}` : ""}.
          </p>
          <p className="muted" style={{ fontSize: "0.86rem" }}>
            The centre can see {first}&apos;s day and help run it. Everything you&apos;ve built —
            lessons, progress, notes, the profile — belongs to {first} and stays with you if you
            leave.
          </p>
          {state.canAct && (
            <button
              className="btn quiet"
              disabled={busy}
              onClick={async () => {
                if (
                  !confirm(
                    `Leave ${state.member!.name}? ${first} keeps everything of their own. You'd lose the centre's shared library and their staff would no longer see ${first}.`
                  )
                )
                  return;
                await post({ op: "leave", childId: state.childId });
              }}
            >
              Leave this centre
            </button>
          )}
        </>
      ) : state.pending ? (
        /* ── waiting on an answer ── */
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            <span className="pill warn" style={{ marginRight: 8 }}>
              Waiting
            </span>
            You asked <strong>{state.pending.centerName}</strong> on {state.pending.createdAt}. They
            decide — we don&apos;t.
          </p>
          {state.canAct && (
            <button
              className="btn quiet"
              disabled={busy}
              onClick={() => post({ op: "withdraw", requestId: state.pending!.id })}
            >
              Withdraw the request
            </button>
          )}
        </>
      ) : (
        /* ── not in a centre ── */
        <>
          <p className="muted" style={{ marginTop: 0 }}>
            {first} isn&apos;t part of a centre. That&apos;s a perfectly good place to be —
            everything works without one. A centre adds a room, other families, and staff who can
            help run the day.
          </p>

          {state.lastDecision?.status === "declined" && (
            <p className="muted" style={{ fontSize: "0.86rem" }}>
              <strong>{state.lastDecision.centerName}</strong> declined on{" "}
              {state.lastDecision.decidedAt}
              {state.lastDecision.note ? ` — “${state.lastDecision.note}”` : "."} You can ask again
              or try another.
            </p>
          )}

          {state.canAct ? (
            state.options.length ? (
              <>
                <label className="lbl">Ask a centre to take {first}</label>
                <select
                  className="field"
                  value={centerId}
                  onChange={(e) => setCenterId(e.target.value)}
                >
                  <option value="">Choose a centre…</option>
                  {state.options.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.region ? ` — ${c.region}` : ""}
                    </option>
                  ))}
                </select>
                <textarea
                  className="field"
                  rows={3}
                  style={{ marginTop: 8 }}
                  maxLength={600}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Anything they should know — which days you'd come, what ${first} enjoys, what you're hoping for.`}
                />
                <button
                  className="btn"
                  style={{ marginTop: 10 }}
                  disabled={busy || !centerId}
                  onClick={() => post({ op: "request", childId: state.childId, centerId, message })}
                >
                  {busy ? "Sending…" : "Ask to join"}
                </button>
              </>
            ) : (
              <p className="muted" style={{ fontSize: "0.86rem" }}>
                There are no centres open yet. When one opens near you, it&apos;ll appear here.
              </p>
            )
          ) : (
            <p className="muted" style={{ fontSize: "0.86rem" }}>
              Only {first}&apos;s main parent or guardian
              {state.primaryGuideName ? ` (${state.primaryGuideName})` : ""} can join or leave a
              centre.
            </p>
          )}
        </>
      )}

      {error && (
        <p className="muted" role="alert" style={{ color: "var(--crit)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
