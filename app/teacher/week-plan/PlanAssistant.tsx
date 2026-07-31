"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The guide, thinking out loud about the week in front of them.
//
// Answers first, changes second, and never a change without a press. The
// assistant can see the child's whole record — scores, gaps, the team's notes,
// the IEP — so the useful questions are the ones a spreadsheet cannot answer:
// why this again, is this too much, what did his OT say about handwriting.

export type Proposal = {
  kind: "replanSubject";
  subject: string;
  focus: string;
  standardCode: string;
  why: string;
};

type Turn = { role: "user" | "assistant"; text: string; proposals?: Proposal[] };

const STARTERS = [
  "In maths, start fractions instead of more multiplication",
  "Is this week too heavy for him?",
  "What does the team's notes say I should watch this week?",
];

export default function PlanAssistant({
  childId,
  childName,
  weekStart,
  hasPlan,
}: {
  childId: string;
  childName: string;
  weekStart: string;
  hasPlan: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [applied, setApplied] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  async function ask(question: string) {
    if (!question.trim() || busy) return;
    setBusy(true);
    setError(null);
    setQ("");
    const history = turns.map((t) => ({ role: t.role, text: t.text }));
    setTurns((t) => [...t, { role: "user", text: question }]);
    const d = await fetch("/api/plan-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "ask", childId, weekStart, question, history }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (!d?.ok) {
      setError(d?.error ?? "That didn't go through.");
      return;
    }
    setTurns((t) => [...t, { role: "assistant", text: d.reply, proposals: d.proposals ?? [] }]);
  }

  async function apply(p: Proposal, key: string) {
    setBusy(true);
    const d = await fetch("/api/plan-assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "apply", childId, weekStart, proposal: p }),
    })
      .then((r) => r.json())
      .catch(() => null);
    setBusy(false);
    if (!d?.ok) {
      setError(d?.error ?? "Couldn't apply that.");
      return;
    }
    const built = (d.rebuilt ?? []) as { date: string; title: string }[];
    setApplied((a) => ({
      ...a,
      [key]:
        `Rebuilt ${d.changed} lesson${d.changed === 1 ? "" : "s"} as a ramp — approve the week to put them on his days.` +
        (built.length ? ` ${built.map((b) => b.title).join(" → ")}` : ""),
    }));
    router.refresh();
  }

  if (!hasPlan) return null;

  if (!open) {
    return (
      <div className="row" style={{ marginTop: 16 }}>
        <button className="btn quiet" onClick={() => setOpen(true)}>
          ✦ Ask about this week
        </button>
      </div>
    );
  }

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <h2 style={{ margin: 0, fontSize: "1.05rem" }}>Ask about {childName}&apos;s week</h2>
        <button className="chip" onClick={() => setOpen(false)} aria-label="Close">
          ✕
        </button>
      </div>
      <p className="muted" style={{ marginTop: 4, fontSize: "0.82rem" }}>
        It can see his scores, coverage gaps, the team&apos;s notes and his IEP. It never changes the
        plan on its own — anything it suggests, you press.
      </p>

      {turns.length === 0 && (
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 10 }}>
          {STARTERS.map((s) => (
            <button key={s} className="chip" onClick={() => ask(s)} disabled={busy}>
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="stack" style={{ gap: 12, marginTop: 12 }}>
        {turns.map((t, i) => (
          <div key={i}>
            {t.role === "user" ? (
              <p style={{ margin: 0, fontWeight: 600 }}>{t.text}</p>
            ) : (
              <>
                <p style={{ margin: 0, whiteSpace: "pre-line" }}>{t.text}</p>
                {(t.proposals ?? []).map((p, j) => {
                  const key = `${i}-${j}`;
                  return (
                    <div key={key} className="card" style={{ marginTop: 8, padding: 10 }}>
                      <p style={{ margin: 0, fontSize: "0.9rem" }}>
                        <strong>Re-plan {p.subject} for this week</strong>
                        {p.focus ? ` → ${p.focus}` : ""}
                        {p.standardCode ? ` (${p.standardCode})` : ""}
                      </p>
                      <p className="muted" style={{ margin: "4px 0 8px", fontSize: "0.85rem" }}>
                        {p.why}
                      </p>
                      {applied[key] ? (
                        <span className="pill good">{applied[key]}</span>
                      ) : (
                        <button className="chip approve" disabled={busy} onClick={() => apply(p, key)}>
                          Apply this
                        </button>
                      )}
                    </div>
                  );
                })}
              </>
            )}
          </div>
        ))}
        {busy && <p className="muted" style={{ margin: 0 }}>Thinking…</p>}
        {error && (
          <p className="muted" role="alert" style={{ color: "var(--crit)", margin: 0 }}>
            {error}
          </p>
        )}
      </div>

      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input
          className="field"
          style={{ flex: 1 }}
          value={q}
          placeholder={`Ask anything about ${childName}'s week…`}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") ask(q);
          }}
        />
        <button className="btn" disabled={busy || !q.trim()} onClick={() => ask(q)}>
          Ask
        </button>
      </div>
    </div>
  );
}
