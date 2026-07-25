"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ASSESSMENTS,
  assessmentById,
  assessmentsForGrade,
  KIND_LABEL,
  STATUSES,
  STATUS_LABEL,
} from "@/lib/assessments";

export type TestRow = {
  id: string;
  testId: string;
  status: string;
  testDate: string;
  score: string;
  notes: string;
};

const statusPill = (s: string) =>
  s === "taken" ? "good" : s === "registered" ? "warn" : s === "skipped" ? "crit" : "";

// Tests happen on the provider's site. Here the family picks what to take, keeps
// track of where each one is up to, and types the result back in so it can feed
// the weekly plan and the IEP review.
export default function Tests({
  childId,
  childName,
  grade,
  rows,
}: {
  childId: string;
  childName: string;
  grade: string;
  rows: TestRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<Record<string, Partial<TestRow>>>({});

  const post = async (body: unknown) => {
    const r = await fetch("/api/child", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return r.json();
  };

  async function add(testId: string) {
    setBusy(testId);
    setNote(null);
    const d = await post({ op: "planTest", childId, testId });
    setBusy(null);
    if (d.error) return setNote(d.error);
    router.refresh();
  }

  async function save(planId: string) {
    setBusy(planId);
    const d = draft[planId] ?? {};
    const res = await post({ op: "updateTest", childId, planId, ...d });
    setBusy(null);
    if (res.error) return setNote(res.error);
    setDraft((p) => ({ ...p, [planId]: {} }));
    setNote("Saved.");
    router.refresh();
  }

  async function remove(planId: string) {
    setBusy(planId);
    await post({ op: "removeTest", childId, planId });
    setBusy(null);
    router.refresh();
  }

  const planned = new Set(rows.map((r) => r.testId));
  const suggested = (showAll ? ASSESSMENTS : assessmentsForGrade(grade)).filter((a) => !planned.has(a.id));

  return (
    <>
      <section style={{ marginTop: 28 }}>
        <h2 style={{ margin: "0 0 4px" }}>🧪 {childName}&apos;s tests</h2>
        <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
          Tests are taken on the provider&apos;s own site — you register there. Track each one here, and
          type the result back in: a MAP score updates {childName}&apos;s levels and feeds the weekly plan.
        </p>

        {note && (
          <p className="muted" role="status" style={{ fontSize: "0.85rem" }}>
            {note}
          </p>
        )}

        {rows.length === 0 ? (
          <p className="muted" style={{ fontSize: "0.9rem" }}>
            Nothing tracked yet — add one from the list below.
          </p>
        ) : (
          <div className="stack" style={{ gap: 10 }}>
            {rows.map((r) => {
              const t = assessmentById(r.testId);
              const d = draft[r.id] ?? {};
              const val = <K extends keyof TestRow>(k: K) => (d[k] ?? r[k]) as string;
              const dirty = Object.keys(d).length > 0;
              return (
                <div key={r.id} className="card" style={{ padding: "10px 12px" }}>
                  <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                    <span>
                      <strong>{t?.name ?? r.testId}</strong>{" "}
                      <span className="muted" style={{ fontSize: "0.82rem" }}>
                        · {t?.provider}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 6 }}>
                      <span className={`pill ${statusPill(r.status)}`}>{STATUS_LABEL[r.status] ?? r.status}</span>
                      {t?.url && (
                        <a className="chip" href={t.url} target="_blank" rel="noreferrer">
                          Register →
                        </a>
                      )}
                      <button className="chip danger" onClick={() => remove(r.id)} disabled={busy === r.id}>
                        ✕
                      </button>
                    </span>
                  </div>

                  <div className="row" style={{ gap: 8, marginTop: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                    <label className="inline muted">
                      Status
                      <select
                        className="field short"
                        value={val("status")}
                        onChange={(e) => setDraft((p) => ({ ...p, [r.id]: { ...d, status: e.target.value } }))}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {STATUS_LABEL[s]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="inline muted">
                      Date
                      <input
                        className="field short"
                        type="date"
                        value={val("testDate")}
                        onChange={(e) => setDraft((p) => ({ ...p, [r.id]: { ...d, testDate: e.target.value } }))}
                      />
                    </label>
                    <label className="inline muted" style={{ flex: 1, minWidth: 200 }}>
                      Result
                      <input
                        className="field"
                        placeholder={t?.feedsRit ? "e.g. Math RIT 198, Reading RIT 191" : "score / percentile"}
                        value={val("score")}
                        onChange={(e) => setDraft((p) => ({ ...p, [r.id]: { ...d, score: e.target.value } }))}
                      />
                    </label>
                    <button className="btn quiet" onClick={() => save(r.id)} disabled={busy === r.id || !dirty}>
                      {busy === r.id ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {t?.feedsRit && (
                    <p className="muted" style={{ fontSize: "0.76rem", margin: "6px 0 0" }}>
                      Type RIT scores as “Math RIT 198, Reading RIT 191” and marking it <em>Taken</em> updates{" "}
                      {childName}&apos;s levels automatically.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section style={{ marginTop: 24 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
          <h2 style={{ margin: 0, fontSize: "1rem" }}>
            Tests {grade ? `for grade ${grade}` : "you can take"}
          </h2>
          <button className="chip" onClick={() => setShowAll((v) => !v)}>
            {showAll ? "Show grade-appropriate" : "Show all"}
          </button>
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {suggested.map((a) => (
            <div key={a.id} className="card" style={{ padding: "10px 12px" }}>
              <div className="row" style={{ justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span>
                  <strong>{a.name}</strong>{" "}
                  <span className="muted" style={{ fontSize: "0.82rem" }}>
                    · {a.provider}
                  </span>{" "}
                  <span className="pill">{KIND_LABEL[a.kind]}</span>
                </span>
                <span className="row" style={{ gap: 6 }}>
                  <a className="chip" href={a.url} target="_blank" rel="noreferrer">
                    Visit site →
                  </a>
                  <button className="chip approve" onClick={() => add(a.id)} disabled={busy === a.id}>
                    {busy === a.id ? "…" : "+ Track"}
                  </button>
                </span>
              </div>
              <p style={{ margin: "6px 0 0", fontSize: "0.85rem" }}>{a.measures}</p>
              <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.78rem" }}>
                Grades {a.grades[0]}–{a.grades[1]} · {a.cadence} · {a.cost}
                {a.note ? ` · ${a.note}` : ""}
              </p>
            </div>
          ))}
          {suggested.length === 0 && (
            <p className="muted" style={{ fontSize: "0.9rem" }}>
              You&apos;re tracking every test we list for this grade.
            </p>
          )}
        </div>
        <p className="muted" style={{ fontSize: "0.76rem", marginTop: 10 }}>
          Dates, prices and eligibility change — always confirm on the provider&apos;s own site. NeuroBridge
          doesn&apos;t register or proctor any test.
        </p>
      </section>
    </>
  );
}
