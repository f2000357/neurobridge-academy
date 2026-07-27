"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { addDaysStr, fmtMin, hhmmToMin, minToHhmm, weekdayShort } from "@/lib/time";
import { subjectKey, subjectLabel } from "@/lib/subjects";
import { activityLabel, optionsForKind } from "@/lib/activities";
import { slotColor } from "@/lib/slotColor";
import ScheduleTabs from "../schedule/ScheduleTabs";

type Slot = {
  id: string;
  kind: string;
  date: string;
  startMin: number;
  endMin: number;
  subject?: string;
  activity: string;
  teacherId?: string | null;
  lessonPlanId?: string | null;
  lessonPlan: { title: string; subject?: string | null } | null;
  sessions: { state: string }[];
};
type Child = { id: string; name: string };
type Plan = { id: string; title: string; subject: string; durationMin: number; childId: string | null };
type Specialist = { id: string; name: string; childIds: string[] };

const ADD_KIND_LABEL: Record<string, string> = {
  lesson: "Education (lesson)",
  break: "Break / Lunch",
  flexible: "Flexible / elective",
  service: "Support (speech, OT…)",
  testing: "Check-in",
  one_on_one: "1:1 with you",
  free_time: "Free time",
};
const SUBJECTS = ["math", "reading", "writing", "science"];

type AddDraft = {
  date: string;
  startMin: number;
  duration: number;
  kind: string;
  subject: string;
  activity: string;
  planId: string;
  teacherId: string;
};

// The visible school-day window and grid scale.
const DAY_START = 8 * 60; // 8:00 am
const DAY_END = 17 * 60; // 5:00 pm
const PX_PER_MIN = 104 / 60; // ~52px per 30-min block — fits the full lesson name
const SNAP = 15; // minutes
const DAYS = 5; // Mon–Fri

const KIND_LABEL: Record<string, string> = {
  lesson: "Lesson",
  one_on_one: "1:1",
  flexible: "Flexible",
  service: "Support",
  testing: "Check-in",
  break: "Break",
  free_time: "Free time",
};

function gridTop(min: number) {
  return (min - DAY_START) * PX_PER_MIN;
}

export default function WeekGrid({
  childrenList,
  initialChildId,
  initialMonday,
  initialSlots,
  plans = [],
  specialistList = [],
}: {
  childrenList: Child[];
  initialChildId: string;
  initialMonday: string;
  initialSlots: Slot[];
  plans?: Plan[];
  specialistList?: Specialist[];
}) {
  const [childId, setChildId] = useState(initialChildId);
  const [monday, setMonday] = useState(initialMonday);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [note, setNote] = useState<string | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [busy, setBusy] = useState(false);
  const [add, setAdd] = useState<AddDraft | null>(null);
  const specialists = specialistList.filter((t) => t.childIds.includes(childId));
  const availablePlans = plans.filter((p) => !p.childId || p.childId === childId);

  const weekDates = Array.from({ length: DAYS }, (_, i) => addDaysStr(monday, i));
  const gridRef = useRef<HTMLDivElement>(null);

  // Drag state
  const [drag, setDrag] = useState<{
    id: string;
    duration: number;
    grabOffset: number; // px from block top to cursor
    col: number;
    top: number; // px within column
    invalid: boolean;
  } | null>(null);

  const refetch = useCallback(async (cId: string, dates: string[]) => {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "listWeek", childId: cId, dates }),
    });
    const data = await res.json();
    setSlots(data.slots ?? []);
  }, []);

  useEffect(() => {
    const dates = Array.from({ length: DAYS }, (_, i) => addDaysStr(monday, i));
    void refetch(childId, dates);
  }, [childId, monday, refetch]);

  // Given a pointer position, which column and snapped start-minute?
  const posToTarget = useCallback((clientX: number, clientY: number, grabOffset: number, duration: number) => {
    const grid = gridRef.current;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    const labelW = 56;
    const colW = (rect.width - labelW) / DAYS;
    let col = Math.floor((clientX - rect.left - labelW) / colW);
    col = Math.max(0, Math.min(DAYS - 1, col));
    const yInCol = clientY - rect.top - grabOffset;
    let start = DAY_START + Math.round(yInCol / PX_PER_MIN / SNAP) * SNAP;
    start = Math.max(DAY_START, Math.min(DAY_END - duration, start));
    return { col, start };
  }, []);

  function onPointerDownBlock(e: React.PointerEvent, s: Slot) {
    // Don't start a drag from the delete or preview controls.
    const role = (e.target as HTMLElement).dataset.role;
    if (role === "del" || role === "preview") return;
    e.preventDefault();
    const blockTop = gridTop(s.startMin);
    const grabOffset = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    const duration = s.endMin - s.startMin;
    setNote(null);
    setDrag({
      id: s.id,
      duration,
      grabOffset,
      col: weekDates.indexOf(s.date),
      top: blockTop,
      invalid: false,
    });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const t = posToTarget(e.clientX, e.clientY, drag.grabOffset, drag.duration);
    if (!t) return;
    // Live overlap preview against other slots on the target day.
    const targetDate = weekDates[t.col];
    const end = t.start + drag.duration;
    const invalid = slots.some(
      (o) => o.id !== drag.id && o.date === targetDate && t.start < o.endMin && end > o.startMin
    );
    setDrag({ ...drag, col: t.col, top: gridTop(t.start), invalid });
  }

  async function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const t = posToTarget(e.clientX, e.clientY, drag.grabOffset, drag.duration);
    const current = drag;
    setDrag(null);
    if (!t) return;
    const targetDate = weekDates[t.col];
    const startMin = t.start;
    const endMin = startMin + current.duration;
    const orig = slots.find((s) => s.id === current.id);
    // No move = a click, not a drag → open the lesson's preview.
    if (orig && orig.date === targetDate && orig.startMin === startMin) {
      if (orig.kind === "lesson" && orig.lessonPlanId) {
        window.open(`/preview/${orig.lessonPlanId}`, "_blank", "noopener");
      }
      return;
    }

    // Optimistic update
    setSlots((prev) =>
      prev.map((s) => (s.id === current.id ? { ...s, date: targetDate, startMin, endMin } : s))
    );
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update", id: current.id, date: targetDate, startMin, endMin }),
    });
    const data = await res.json();
    if (!data.ok) {
      setNote(data.error === "overlap" ? "That spot is taken — moved it back." : "Could not move that.");
      void refetch(childId, weekDates); // revert to server truth
    }
  }

  // ── delete + add (click an empty cell) ──────────────────────────────────
  async function deleteSlot(s: Slot) {
    if (s.sessions.length > 0 && !confirm("This block has lesson work recorded. Remove it anyway?")) return;
    setBusy(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "remove", id: s.id }),
    });
    setBusy(false);
    void refetch(childId, weekDates);
  }

  function onColClick(date: string, e: React.MouseEvent) {
    if (drag) return;
    if ((e.target as HTMLElement).closest(".wg-block")) return; // clicked a block
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let start = DAY_START + Math.round(y / PX_PER_MIN / 30) * 30;
    start = Math.max(DAY_START, Math.min(DAY_END - 30, start));
    setNote(null);
    setAdd({ date, startMin: start, duration: 30, kind: "lesson", subject: "math", activity: "", planId: "", teacherId: "" });
  }

  async function submitAdd() {
    if (!add) return;
    const chosenPlan = plans.find((p) => p.id === add.planId);
    const duration = chosenPlan ? chosenPlan.durationMin : add.duration;
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "add",
        childId,
        date: add.date,
        kind: add.kind,
        subject: add.kind === "lesson" ? (chosenPlan ? chosenPlan.subject : add.subject) : "",
        activity: add.kind === "flexible" || add.kind === "service" ? add.activity : "",
        lessonPlanId: add.kind === "lesson" ? add.planId : "",
        teacherId: add.teacherId || null,
        startMin: add.startMin,
        endMin: add.startMin + duration,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setAdd(null);
    void refetch(childId, weekDates);
  }

  async function repeatWeek() {
    setNote(null);
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "copyWeek", childId, fromDates: weekDates, weeks: repeatWeeks }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(
      `Repeated this week for the next ${repeatWeeks} week${repeatWeeks > 1 ? "s" : ""} — added ${data.filled} slot${data.filled === 1 ? "" : "s"}.` +
        (data.skippedDays ? " Days that already had a plan were left as they were." : "")
    );
  }

  // Plant the family's chosen interest blocks into this week's free afternoons.
  async function placeInterests() {
    setNote(null);
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "placeInterests", childId, weekStart: monday }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    if (data.added === 0) {
      setNote(data.note ?? "Nothing to place.");
      return;
    }
    setNote(
      `Added ${data.added} interest block${data.added === 1 ? "" : "s"}. Drag them anywhere, or remove any you don't want.`
    );
    void refetch(childId, weekDates);
  }

  // Two 30-minute assessment slots on Friday at 2pm.
  async function placeAssessments() {
    setNote(null);
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "placeAssessments", childId, weekStart: monday }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    setNote(
      data.added === 0
        ? (data.note ?? "Nothing added.")
        : `Added ${data.added} Friday assessment slot${data.added === 1 ? "" : "s"} at 2pm.`
    );
    void refetch(childId, weekDates);
  }

  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;

  return (
    <main className="page wrap" style={{ maxWidth: 980 }}>
      <ScheduleTabs active="week" />
      <p className="eyebrow">Schedule · whole week</p>
      <h1>The week at a glance</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Move blocks around, repeat a week, or drop in interests and Friday check-ins. To add or edit a
        single day&apos;s blocks, switch to <strong>Day</strong>.
      </p>

      <div className="card" style={{ marginTop: 12 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <label className="inline muted">
            Student
            <select className="field short" value={childId} onChange={(e) => setChildId(e.target.value)}>
              {childrenList.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="row">
            <button className="chip" onClick={() => setMonday(addDaysStr(monday, -7))}>
              ← Previous
            </button>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              Week of {weekdayShort(monday)}
            </span>
            <button className="chip" onClick={() => setMonday(addDaysStr(monday, 7))}>
              Next →
            </button>
          </div>
        </div>
        <div className="row" style={{ marginTop: 12, justifyContent: "flex-end", gap: 8 }}>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Copy this week forward for
          </span>
          <select
            className="field tiny"
            value={repeatWeeks}
            onChange={(e) => setRepeatWeeks(Number(e.target.value))}
            aria-label="Number of weeks to repeat"
          >
            {[1, 2, 4, 8, 12].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            week{repeatWeeks > 1 ? "s" : ""}
          </span>
          <button className="btn quiet" onClick={repeatWeek} disabled={busy}>
            Repeat week →
          </button>
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Suggest this child&apos;s interest blocks in the free afternoons
          </span>
          <button className="btn quiet" onClick={placeInterests} disabled={busy}>
            Add interest blocks →
          </button>
        </div>
        <div className="row" style={{ marginTop: 8, justifyContent: "flex-end", gap: 8 }}>
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            Two 30-min assessment slots, Friday 2pm
          </span>
          <button className="btn quiet" onClick={placeAssessments} disabled={busy}>
            Add Friday assessments →
          </button>
        </div>
      </div>

      {note && (
        <p className="muted" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

      <div className="wg-legend" aria-hidden="true">
        {[
          ["Math", slotColor("lesson", "Math")],
          ["Reading", slotColor("lesson", "ELA — Reading")],
          ["Writing", slotColor("lesson", "ELA — Writing")],
          ["Science", slotColor("lesson", "Science")],
          ["Break", slotColor("break")],
          ["Flexible", slotColor("flexible")],
          ["Support", slotColor("service")],
        ].map(([label, color]) => (
          <span key={label} className="wg-legend-item">
            <span className="wg-swatch" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      <div
        className="weekgrid"
        ref={gridRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        style={{ marginTop: 16 }}
      >
        {/* Day headers */}
        <div className="wg-head">
          <div className="wg-corner" />
          {weekDates.map((d) => (
            <div key={d} className="wg-dayhead">
              {weekdayShort(d)}
            </div>
          ))}
        </div>

        {/* Body: time labels + day columns */}
        <div className="wg-body" style={{ height: gridHeight }}>
          <div className="wg-times">
            {hours.map((m) => (
              <div key={m} className="wg-time" style={{ top: gridTop(m) }}>
                {fmtMin(m)}
              </div>
            ))}
          </div>
          {weekDates.map((date, col) => (
            <div key={date} className="wg-col" style={{ cursor: "copy" }} onClick={(e) => onColClick(date, e)}>
              {hours.map((m) => (
                <div key={m} className="wg-hourline" style={{ top: gridTop(m) }} />
              ))}
              {add?.date === date && (
                <div className="wg-block ghost" style={{ top: gridTop(add.startMin), height: add.duration * PX_PER_MIN }}>
                  <span className="wg-btitle">New block</span>
                </div>
              )}
              {slots
                .filter((s) => s.date === date)
                .map((s) => {
                  const isDragging = drag?.id === s.id;
                  const top = isDragging && drag ? drag.top : gridTop(s.startMin);
                  const height = (s.endMin - s.startMin) * PX_PER_MIN;
                  const showInCol = isDragging && drag ? drag.col === col : true;
                  if (isDragging && drag && drag.col !== col) return null;
                  const done = s.sessions.some((x) => x.state === "closed");
                  const isLesson = s.kind === "lesson";
                  const subj = s.subject || s.lessonPlan?.subject || "";
                  const subjClass = isLesson ? `subj-${subjectKey(subj)}` : "";
                  return (
                    <div
                      key={s.id}
                      className={`wg-block k-${s.kind} ${subjClass} ${isDragging ? "dragging" : ""} ${
                        isDragging && drag?.invalid ? "invalid" : ""
                      } ${done ? "done" : ""}`}
                      style={{ top, height, display: showInCol ? "flex" : "none" }}
                      onPointerDown={(e) => onPointerDownBlock(e, s)}
                      title={
                        isLesson
                          ? `${subjectLabel(subj)} — ${s.lessonPlan?.title ?? "no lesson yet"}${
                              s.lessonPlanId ? " · click to preview" : ""
                            }`
                          : KIND_LABEL[s.kind]
                      }
                    >
                      {/* Same toolbar as the day view. The week keeps only the
                          two controls that fit a narrow column — arranging the
                          week is a different job from running a session. */}
                      <span className="wg-tools">
                        {isLesson && s.lessonPlanId && (
                          <a
                            className="wg-tool wg-preview"
                            data-role="preview"
                            href={`/preview/${s.lessonPlanId}`}
                            target="_blank"
                            rel="noreferrer"
                            onPointerDown={(e) => e.stopPropagation()}
                            title="Preview this lesson"
                            aria-label="Preview lesson"
                          >
                            👁
                          </a>
                        )}
                        <button
                          className="wg-tool wg-del"
                          data-role="del"
                          aria-label="Delete block"
                          onClick={() => deleteSlot(s)}
                        >
                          ✕
                        </button>
                      </span>
                      {isLesson ? (
                        // Subject is shown by the block's colour; time by its
                        // position — so use the whole block for the lesson name.
                        <span className="wg-bname">
                          {s.lessonPlan?.title || (subj ? subjectLabel(subj) : "Education")}
                        </span>
                      ) : (
                        <>
                          <span className="wg-btitle">
                            {activityLabel(s.activity) ?? KIND_LABEL[s.kind]}
                          </span>
                          <span className="wg-btime">
                            {fmtMin(s.startMin)}–{fmtMin(s.endMin)}
                          </span>
                        </>
                      )}
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        Click any empty spot to add a block · drag a block to another day or time (snaps to 15 min) · ✕ to
        delete.
      </p>

      {/* Inline editor for a new block */}
      {add && (
        <div className="card lift" style={{ marginTop: 14, borderColor: "var(--accent)" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong>
              New block · {weekdayShort(add.date)}
            </strong>
            <button className="chip" onClick={() => setAdd(null)}>
              Cancel
            </button>
          </div>
          <div className="row" style={{ flexWrap: "wrap", gap: 10 }}>
            <label className="inline muted">
              Type
              <select
                className="field short"
                value={add.kind}
                onChange={(e) => setAdd({ ...add, kind: e.target.value, activity: "", planId: "" })}
              >
                {Object.entries(ADD_KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            {add.kind === "lesson" && (
              <>
                <label className="inline muted">
                  Subject
                  <select
                    className="field short"
                    value={add.subject}
                    onChange={(e) => setAdd({ ...add, subject: e.target.value })}
                    disabled={Boolean(add.planId)}
                  >
                    {SUBJECTS.map((s) => (
                      <option key={s} value={s}>
                        {subjectLabel(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="inline muted">
                  Lesson (optional)
                  <select
                    className="field short"
                    value={add.planId}
                    onChange={(e) => setAdd({ ...add, planId: e.target.value })}
                  >
                    <option value="">Empty block — fill later</option>
                    {availablePlans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.title}
                      </option>
                    ))}
                  </select>
                </label>
              </>
            )}

            {optionsForKind(add.kind).length > 0 && (
              <label className="inline muted">
                {add.kind === "service" ? "Service" : "Elective"}
                <select
                  className="field short"
                  value={add.activity}
                  onChange={(e) => setAdd({ ...add, activity: e.target.value })}
                >
                  <option value="">{add.kind === "service" ? "Choose…" : "Child's choice"}</option>
                  {optionsForKind(add.kind).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.emoji} {a.label}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {specialists.length > 0 && add.kind !== "lesson" && (
              <label className="inline muted">
                Taught by
                <select
                  className="field short"
                  value={add.teacherId}
                  onChange={(e) => setAdd({ ...add, teacherId: e.target.value })}
                >
                  <option value="">You</option>
                  {specialists.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="inline muted">
              Start
              <input
                className="field short"
                type="time"
                value={minToHhmm(add.startMin)}
                onChange={(e) => setAdd({ ...add, startMin: hhmmToMin(e.target.value) })}
              />
            </label>
            <label className="inline muted">
              Minutes
              <input
                className="field tiny"
                type="number"
                min={5}
                max={120}
                step={5}
                value={add.duration}
                onChange={(e) => setAdd({ ...add, duration: Number(e.target.value) })}
                disabled={Boolean(add.planId)}
              />
            </label>
            <button className="btn" onClick={submitAdd} disabled={busy}>
              Add block
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
