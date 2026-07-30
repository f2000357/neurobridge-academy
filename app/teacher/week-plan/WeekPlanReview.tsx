"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import PlanAssistant from "./PlanAssistant";
import { addDaysStr, weekdayShort, todayStr } from "@/lib/time";

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
  /** The child actually finished a session on this lesson — including one they
   *  pulled forward and did early, which the plan's own status never knows. */
  done: boolean;
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
  const [acting, setActing] = useState<string | null>(null);
  const today = todayStr();

  // After router.refresh() the server sends fresh lessons — adopt them, or the
  // list would keep showing the state from when the page first loaded.
  useEffect(() => {
    setPlan(initialPlan);
  }, [initialPlan]);

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
    if (data.note) {
      // e.g. nothing upcoming to regenerate — history stays as it is.
      setNote(data.note);
      return;
    }
    setNote(null);
    router.refresh(); // re-fetch server data (same URL) to show the fresh plan
  }

  async function approveAndBuild() {
    if (!plan) return;
    setBusy(true);
    setNote("Publishing the week onto each day…");
    // Drafts were already built at generate time (and may be guide-edited);
    // approve publishes + schedules them in one call, preserving edits.
    const res = await fetch("/api/weekplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "approve", planId: plan.id }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote("Week approved and scheduled. The lessons are now on each day.");
    setPlan((pl) => (pl ? { ...pl, status: "approved" } : pl));
    router.refresh();
  }

  // Per-lesson approve / unapprove. Unapproving takes it off the schedule and
  // back to an editable draft (the same skill can then be reused or replaced).
  async function lessonAction(weeklyLessonId: string, op: "approveOne" | "unapprove") {
    setActing(weeklyLessonId);
    setNote(null);
    const res = await fetch("/api/weekplan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op, weeklyLessonId }),
    });
    const data = await res.json();
    setActing(null);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(
      op === "unapprove"
        ? "Taken off the schedule — edit it, or regenerate the rest of the week."
        : "Scheduled onto the day."
    );
    router.refresh();
  }

  // Lessons still waiting to go onto the schedule (past days are never counted).
  const draftCount = (plan?.lessons ?? []).filter((l) => l.status !== "approved" && l.date >= today).length;

  // Group lessons by subject for review.
  const bySubject = new Map<string, PlanLesson[]>();
  for (const l of plan?.lessons ?? []) {
    if (!bySubject.has(l.subject)) bySubject.set(l.subject, []);
    bySubject.get(l.subject)!.push(l);
  }

  return (
    <main className="page" style={{ maxWidth: 860 }}>
      <p className="eyebrow">Lessons</p>
      <h1>Weekly lessons</h1>
      <p className="muted">
        Every lesson for the week lives here — drafts <em>and</em> the ones already on the schedule.
        <strong> Preview or edit any of them any time.</strong> Unapprove an upcoming lesson to take it
        off the schedule and change it; past days are locked.
      </p>

      <PlanAssistant
        childId={childId}
        childName={childrenList.find((c) => c.id === childId)?.name ?? "this learner"}
        weekStart={weekStart}
        hasPlan={Boolean(plan)}
      />

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
            {busy ? "Working…" : plan ? "✦ Regenerate the rest of the week" : "✦ Generate this week"}
          </button>
        </div>
      </div>

      {note && (
        <p className="muted" role="status" style={{ marginTop: 12 }}>
          {note}
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
                  {lessons.map((l, i) => {
                    const isPast = l.date < today;
                    const isApproved = l.status === "approved";
                    // Finished work is a checked-off topic, not a proposal to
                    // read. One line, no rationale, no preview links.
                    if (l.done) {
                      return (
                        <div key={l.id} className="ramp-step" style={{ opacity: 0.6 }}>
                          <div className="row" style={{ gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                            <span className="ramp-day">{weekdayShort(l.date)}</span>
                            <strong style={{ fontWeight: 600 }}>{l.topic || l.title}</strong>
                            <span className="pill good">done ✓</span>
                          </div>
                        </div>
                      );
                    }
                    return (
                    <div key={l.id} className="ramp-step" style={isPast ? { opacity: 0.75 } : undefined}>
                      <div className="ramp-meta">
                        <span className="ramp-day">{weekdayShort(l.date)}</span>
                        <span className="ramp-level" title={`Difficulty step ${l.level}`}>
                          {"▁▂▃▄▅▆▇█".slice(0, Math.min(8, Math.max(1, i + 1)))}
                        </span>
                      </div>
                      <strong className="ramp-title">{l.title}</strong>
                      <p className="muted ramp-why">{l.rationale}</p>

                      <div className="row" style={{ gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                        {/* Done wins over everything else: once he has actually
                            sat and finished it, "scheduled" and "past" are
                            beside the point. */}
                        {l.done ? (
                          <span className="pill good">done ✓</span>
                        ) : isApproved ? (
                          <span className="pill good">scheduled ✓</span>
                        ) : (
                          <span className="pill warn">draft</span>
                        )}
                        {isPast && !l.done && <span className="pill">past</span>}
                      </div>

                      {l.lessonPlanId && (
                        <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                          <a className="chip" href={`/preview/${l.lessonPlanId}`} target="_blank" rel="noreferrer">
                            Preview →
                          </a>
                          <a className="chip" href={`/teacher/plans/${l.lessonPlanId}`} target="_blank" rel="noreferrer">
                            Edit
                          </a>
                          {!isPast && isApproved && (
                            <button
                              className="chip danger"
                              disabled={acting === l.id}
                              onClick={() => lessonAction(l.id, "unapprove")}
                              title="Take it off the schedule so you can edit or replace it"
                            >
                              {acting === l.id ? "…" : "Unapprove"}
                            </button>
                          )}
                          {!isPast && !isApproved && (
                            <button
                              className="chip approve"
                              disabled={acting === l.id}
                              onClick={() => lessonAction(l.id, "approveOne")}
                            >
                              {acting === l.id ? "…" : "✓ Approve"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>

          <div className="row" style={{ marginTop: 28, gap: 12, flexWrap: "wrap" }}>
            {draftCount > 0 && (
              <button className="btn" onClick={approveAndBuild} disabled={busy}>
                {busy ? "Publishing…" : `Approve & schedule (${draftCount})`}
              </button>
            )}
            <button className="btn quiet" onClick={generate} disabled={busy}>
              ✦ Regenerate the rest of the week
            </button>
          </div>
          <p className="muted" style={{ marginTop: 10, fontSize: "0.85rem" }}>
            {draftCount === 0
              ? "Every lesson this week is on the schedule. "
              : `${draftCount} lesson${draftCount === 1 ? "" : "s"} still to approve. `}
            Regenerating only replaces <strong>upcoming</strong> lessons — past days stay exactly as
            they are.
          </p>
        </>
      )}
    </main>
  );
}
