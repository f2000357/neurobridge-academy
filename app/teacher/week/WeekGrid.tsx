"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addDaysStr, fmtMin, weekdayShort } from "@/lib/time";
import { subjectKey, subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/activities";

type Slot = {
  id: string;
  kind: string;
  date: string;
  startMin: number;
  endMin: number;
  activity: string;
  lessonPlan: { title: string; subject?: string | null } | null;
  sessions: { state: string }[];
};
type Child = { id: string; name: string };

// The visible school-day window and grid scale.
const DAY_START = 8 * 60; // 8:00 am
const DAY_END = 17 * 60; // 5:00 pm
const PX_PER_MIN = 64 / 60; // 64px per hour
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
}: {
  childrenList: Child[];
  initialChildId: string;
  initialMonday: string;
  initialSlots: Slot[];
}) {
  const [childId, setChildId] = useState(initialChildId);
  const [monday, setMonday] = useState(initialMonday);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [note, setNote] = useState<string | null>(null);
  const [repeatWeeks, setRepeatWeeks] = useState(4);
  const [busy, setBusy] = useState(false);

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
    // Don't start a drag from the delete button.
    if ((e.target as HTMLElement).dataset.role === "del") return;
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
    if (orig && orig.date === targetDate && orig.startMin === startMin) return; // no move

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

  const hours: number[] = [];
  for (let m = DAY_START; m <= DAY_END; m += 60) hours.push(m);
  const gridHeight = (DAY_END - DAY_START) * PX_PER_MIN;

  return (
    <main className="page wrap" style={{ maxWidth: 980 }}>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <p className="eyebrow">Week calendar</p>
          <h1>The week at a glance</h1>
        </div>
        <Link className="btn quiet" href="/teacher/schedule">
          Add slots →
        </Link>
      </div>

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
      </div>

      {note && (
        <p className="muted" role="status" style={{ marginTop: 10 }}>
          {note}
        </p>
      )}

      <div className="wg-legend" aria-hidden="true">
        {[
          ["math", "Math"],
          ["reading", "Reading"],
          ["writing", "Writing"],
          ["science", "Science"],
        ].map(([k, label]) => (
          <span key={k} className="wg-legend-item">
            <span className={`wg-swatch subj-${k}`} />
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
            <div key={date} className="wg-col">
              {hours.map((m) => (
                <div key={m} className="wg-hourline" style={{ top: gridTop(m) }} />
              ))}
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
                  const subjClass = isLesson ? `subj-${subjectKey(s.lessonPlan?.subject)}` : "";
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
                          ? `${subjectLabel(s.lessonPlan?.subject)} — ${s.lessonPlan?.title ?? ""}`
                          : KIND_LABEL[s.kind]
                      }
                    >
                      <span className="wg-btitle">
                        {isLesson ? subjectLabel(s.lessonPlan?.subject) : activityLabel(s.activity) ?? KIND_LABEL[s.kind]}
                      </span>
                      {isLesson && s.lessonPlan?.title && (
                        <span className="wg-btopic">{s.lessonPlan.title}</span>
                      )}
                      <span className="wg-btime">
                        {fmtMin(s.startMin)}–{fmtMin(s.endMin)}
                      </span>
                    </div>
                  );
                })}
            </div>
          ))}
        </div>
      </div>

      <p className="muted" style={{ marginTop: 14, fontSize: "0.85rem" }}>
        Drag any block to a new day or time. It snaps to 15 minutes and won&apos;t drop onto a taken slot.
        Use “Add slots” to create new ones.
      </p>
    </main>
  );
}
