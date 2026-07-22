"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addDaysStr, weekdayShort } from "@/lib/time";

type Child = { id: string; name: string };
export type PlanLesson = {
  id: string;
  subject: string;
  focus: string;
  date: string;
  order: number;
  level: number;
  topic: string;
  standardCode: string;
  title: string;
  rationale: string;
  status: string;
  lessonPlanId: string | null;
};
export type PlanData = { id: string; status: string; lessons: PlanLesson[] };

export default function WeekPlanReview({
  childrenList,
  initialChildId,
  initialWeekStart,
  initialPlan,
}: {
  childrenList: Child[];
  initialChildId: string;
  initialWeekStart: string;
  initialPlan: PlanData | null;
}) {
  const router = useRouter();
  const childId = initialChildId;
  const weekStart = initialWeekStart;
  const [plan, setPlan] = useState<PlanData | null>(initialPlan);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);

  const go = (cId: string, wk: string) =>
    router.push(`/teacher/week-plan?childId=${cId}&weekStart=${wk}`);

  const weekLabel = `${weekdayShort(weekStart)} – ${weekdayShort(addDaysStr(weekStart, 4))}`;

  async function generate() {
    setBusy(true);
    setNote("Reading where they are and building the week… this uses the stronger model.");
    const res = await fetch("/api/weekplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "generate", childId, weekStart }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(null);
    router.refresh(); // re-fetch server data (same URL) to show the fresh plan
  }

  async function approveAndBuild() {
    if (!plan) return;
    setBusy(true);
    setNote(null);
    await fetch("/api/weekplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "approve", planId: plan.id }),
    });
    const pending = plan.lessons.filter((l) => l.status !== "approved");
    setProgress({ done: 0, total: pending.length });
    for (let i = 0; i < pending.length; i++) {
      await fetch("/api/weekplan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ op: "materializeOne", weeklyLessonId: pending[i].id }),
      });
      setProgress({ done: i + 1, total: pending.length });
    }
    setBusy(false);
    setProgress(null);
    setNote("Week approved and scheduled. The lessons are now on each day.");
    setPlan((pl) => (pl ? { ...pl, status: "approved" } : pl));
  }

  // Group lessons by subject for review.
  const bySubject = new Map<string, PlanLesson[]>();
  for (const l of plan?.lessons ?? []) {
    if (!bySubject.has(l.subject)) bySubject.set(l.subject, []);
    bySubject.get(l.subject)!.push(l);
  }

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <p className="eyebrow">Weekly plan</p>
      <h1>Review the week</h1>
      <p className="muted">
        At the start of the week, the AI proposes each subject&apos;s focus and a difficulty ramp across
        the days. Review it, then approve — the lessons drop onto the schedule.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="inline muted">
            Student
            <select className="field short" value={childId} onChange={(e) => go(e.target.value, weekStart)}>
              {childrenList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="chip" onClick={() => go(childId, addDaysStr(weekStart, -7))}>
              ← Prev
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Week of {weekLabel}
            </span>
            <button className="chip" onClick={() => go(childId, addDaysStr(weekStart, 7))}>
              Next →
            </button>
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn" onClick={generate} disabled={busy}>
            {busy && !progress ? "Working…" : plan ? "✦ Regenerate the week" : "✦ Generate this week"}
          </button>
        </div>
      </div>

      {note && (
        <p className="muted" role="status" style={{ marginTop: 12 }}>
          {note}
        </p>
      )}
      {progress && (
        <p className="muted" style={{ marginTop: 10 }}>
          Preparing lessons… {progress.done} / {progress.total}
        </p>
      )}

      {plan && bySubject.size > 0 && (
        <>
          <div className="stack" style={{ marginTop: 24, gap: 26 }}>
            {Array.from(bySubject.entries()).map(([subject, lessons]) => (
              <section key={subject}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <h2 style={{ margin: 0 }}>{subject}</h2>
                  <span className="pill good">Focus: {lessons[0].focus || lessons[0].topic}</span>
                </div>
                <div className="ramp">
                  {lessons.map((l, i) => (
                    <div key={l.id} className="ramp-step">
                      <div className="ramp-meta">
                        <span className="ramp-day">{weekdayShort(l.date)}</span>
                        <span className="ramp-level" title={`Difficulty step ${l.level}`}>
                          {"▁▂▃▄▅▆▇█".slice(0, Math.min(8, Math.max(1, i + 1)))}
                        </span>
                      </div>
                      <strong className="ramp-title">{l.title}</strong>
                      <p className="muted ramp-why">{l.rationale}</p>
                      {l.status === "approved" && <span className="pill good">scheduled ✓</span>}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {plan.status !== "approved" && (
            <div className="row" style={{ marginTop: 28, gap: 12 }}>
              <button className="btn" onClick={approveAndBuild} disabled={busy}>
                {busy && progress ? "Building the week…" : "Approve & schedule the week"}
              </button>
              <button className="btn quiet" onClick={generate} disabled={busy}>
                Regenerate
              </button>
            </div>
          )}
          {plan.status === "approved" && (
            <p className="muted" style={{ marginTop: 20 }}>
              This week is approved and on the schedule. Regenerate to plan it again.
            </p>
          )}
        </>
      )}
    </main>
  );
}
