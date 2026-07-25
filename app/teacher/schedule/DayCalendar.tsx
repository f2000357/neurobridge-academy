"use client";

import { useRef, useState } from "react";
import { fmtMin, minToHhmm, hhmmToMin } from "@/lib/time";
import { subjectKey, subjectLabel } from "@/lib/subjects";
import { activityLabel, optionsForKind } from "@/lib/activities";

export type CalSlot = {
  id: string;
  kind: string;
  subject: string;
  activity: string;
  teacherId?: string | null;
  lessonPlanId?: string | null;
  startMin: number;
  endMin: number;
  lessonPlan: { title: string; subject?: string | null } | null;
  sessions: { state: string }[];
};
type Plan = { id: string; title: string; subject: string; durationMin: number; childId: string | null };
type Specialist = { id: string; name: string; childIds: string[] };

const KIND_LABEL: Record<string, string> = {
  lesson: "Education (lesson)",
  break: "Break / Lunch",
  flexible: "Flexible / elective",
  service: "Support (speech, OT…)",
  testing: "Check-in",
  one_on_one: "1:1 with you",
  free_time: "Free time",
};
const SUBJECTS = ["math", "reading", "writing", "science"];

const PX_PER_MIN = 100 / 60; // 100px per hour — roomy enough to read and grab
const SNAP = 15;

type AddDraft = {
  startMin: number;
  duration: number;
  kind: string;
  subject: string;
  activity: string;
  planId: string;
  teacherId: string;
};

export default function DayCalendar({
  childId,
  slots,
  plans,
  specialists,
  dayStartMin,
  busy,
  onMove,
  onDelete,
  onAdd,
}: {
  childId: string;
  slots: CalSlot[];
  plans: Plan[];
  specialists: Specialist[];
  dayStartMin: number;
  busy: boolean;
  onMove: (id: string, startMin: number, endMin: number) => void;
  onDelete: (slot: CalSlot) => void;
  onAdd: (payload: {
    kind: string;
    subject: string;
    activity: string;
    lessonPlanId: string;
    teacherId: string | null;
    startMin: number;
    endMin: number;
  }) => Promise<boolean>;
}) {
  // The visible window: from the day's start (or earliest block) to 3pm (or the
  // last block), rounded to whole hours so everything shows.
  const startsList = slots.map((s) => s.startMin);
  const endsList = slots.map((s) => s.endMin);
  const winStart = Math.floor(Math.min(dayStartMin || 540, ...(startsList.length ? startsList : [dayStartMin || 540])) / 60) * 60;
  const winEnd = Math.ceil(Math.max(15 * 60, ...(endsList.length ? endsList : [15 * 60])) / 60) * 60;
  const gridTop = (m: number) => (m - winStart) * PX_PER_MIN;
  const height = (winEnd - winStart) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = winStart; m <= winEnd; m += 60) hours.push(m);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; duration: number; grabOffset: number; top: number; invalid: boolean } | null>(null);
  const [add, setAdd] = useState<AddDraft | null>(null);
  const availablePlans = plans.filter((p) => !p.childId || p.childId === childId);

  // ── move (drag) ─────────────────────────────────────────────────────────
  function pointerToStart(clientY: number, grabOffset: number, duration: number) {
    const body = bodyRef.current;
    if (!body) return winStart;
    const rect = body.getBoundingClientRect();
    const y = clientY - rect.top - grabOffset;
    let start = winStart + Math.round(y / PX_PER_MIN / SNAP) * SNAP;
    start = Math.max(winStart, Math.min(winEnd - duration, start));
    return start;
  }

  function onBlockPointerDown(e: React.PointerEvent, s: CalSlot) {
    const role = (e.target as HTMLElement).dataset.role;
    if (role === "del" || role === "preview") return;
    e.preventDefault();
    const grabOffset = e.clientY - (e.currentTarget as HTMLElement).getBoundingClientRect().top;
    setAdd(null);
    setDrag({ id: s.id, duration: s.endMin - s.startMin, grabOffset, top: gridTop(s.startMin), invalid: false });
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!drag) return;
    const start = pointerToStart(e.clientY, drag.grabOffset, drag.duration);
    const end = start + drag.duration;
    const invalid = slots.some((o) => o.id !== drag.id && start < o.endMin && end > o.startMin);
    setDrag({ ...drag, top: gridTop(start), invalid });
  }
  function onPointerUp(e: React.PointerEvent) {
    if (!drag) return;
    const start = pointerToStart(e.clientY, drag.grabOffset, drag.duration);
    const d = drag;
    setDrag(null);
    const orig = slots.find((s) => s.id === d.id);
    // No move = a click, not a drag → open the lesson's preview.
    if (orig && orig.startMin === start) {
      if (orig.kind === "lesson" && orig.lessonPlanId) {
        window.open(`/preview/${orig.lessonPlanId}`, "_blank", "noopener");
      }
      return;
    }
    onMove(d.id, start, start + d.duration);
  }

  // ── add (click empty space) ─────────────────────────────────────────────
  function onColClick(e: React.MouseEvent) {
    if (drag) return;
    if ((e.target as HTMLElement).closest(".wg-block")) return; // clicked a block, not empty
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    let start = winStart + Math.round(y / PX_PER_MIN / 30) * 30; // snap to 30 for a fresh block
    start = Math.max(winStart, Math.min(winEnd - 30, start));
    setAdd({ startMin: start, duration: 30, kind: "lesson", subject: "math", activity: "", planId: "", teacherId: "" });
  }

  async function submitAdd() {
    if (!add) return;
    const chosenPlan = plans.find((p) => p.id === add.planId);
    const duration = chosenPlan ? chosenPlan.durationMin : add.duration;
    const ok = await onAdd({
      kind: add.kind,
      subject: add.kind === "lesson" ? (chosenPlan ? chosenPlan.subject : add.subject) : "",
      activity: add.kind === "flexible" || add.kind === "service" ? add.activity : "",
      lessonPlanId: add.kind === "lesson" ? add.planId : "",
      teacherId: add.teacherId || null,
      startMin: add.startMin,
      endMin: add.startMin + duration,
    });
    if (ok) setAdd(null);
  }

  return (
    <div className="stack" style={{ gap: 12 }}>
      <div className="weekgrid daygrid" onPointerMove={onPointerMove} onPointerUp={onPointerUp}>
        <div className="wg-body" style={{ height }} ref={bodyRef}>
          <div className="wg-times">
            {hours.map((m) => (
              <div key={m} className="wg-time" style={{ top: gridTop(m) }}>
                {fmtMin(m)}
              </div>
            ))}
          </div>
          <div className="wg-col" onClick={onColClick} style={{ cursor: "copy" }}>
            {hours.map((m) => (
              <div key={m} className="wg-hourline" style={{ top: gridTop(m) }} />
            ))}

            {/* ghost of the block being added */}
            {add && (
              <div className="wg-block ghost" style={{ top: gridTop(add.startMin), height: add.duration * PX_PER_MIN }}>
                <span className="wg-btitle">New block</span>
                <span className="wg-btime">{fmtMin(add.startMin)}</span>
              </div>
            )}

            {slots.map((s) => {
              const isDragging = drag?.id === s.id;
              const top = isDragging && drag ? drag.top : gridTop(s.startMin);
              const h = (s.endMin - s.startMin) * PX_PER_MIN;
              const isLesson = s.kind === "lesson";
              const subj = s.subject || s.lessonPlan?.subject || "";
              const done = s.sessions.some((x) => x.state === "closed");
              return (
                <div
                  key={s.id}
                  className={`wg-block k-${s.kind} ${isLesson ? `subj-${subjectKey(subj)}` : ""} ${
                    isDragging ? "dragging" : ""
                  } ${isDragging && drag?.invalid ? "invalid" : ""} ${done ? "done" : ""}`}
                  style={{ top, height: h }}
                  onPointerDown={(e) => onBlockPointerDown(e, s)}
                  title={isLesson && s.lessonPlanId ? "Click to preview · drag to move" : "Drag to move"}
                >
                  <button
                    className="wg-del"
                    data-role="del"
                    aria-label="Delete block"
                    onClick={() => onDelete(s)}
                  >
                    ✕
                  </button>
                  {isLesson && s.lessonPlanId && (
                    <a
                      className="wg-preview"
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
                  <span className="wg-btitle">
                    {isLesson
                      ? subj
                        ? subjectLabel(subj)
                        : "Education"
                      : activityLabel(s.activity) ?? KIND_LABEL[s.kind] ?? s.kind}
                  </span>
                  {isLesson &&
                    (s.lessonPlan?.title ? (
                      <span className="wg-btopic">{s.lessonPlan.title}</span>
                    ) : (
                      <span className="wg-btopic" style={{ opacity: 0.7 }}>
                        no lesson yet
                      </span>
                    ))}
                  <span className="wg-btime">
                    {fmtMin(s.startMin)}–{fmtMin(s.endMin)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {slots.length === 0 && !add && (
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Empty day. Click a time to add a block, or use “Quick-fill a typical day” above.
        </p>
      )}
      {!add && (
        <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
          Click anywhere on the calendar to add a block · drag a block to move it · ✕ to delete.
        </p>
      )}

      {/* Inline editor for a new block */}
      {add && (
        <div className="card lift" style={{ borderColor: "var(--accent)" }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <strong>New block</strong>
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
                {Object.entries(KIND_LABEL).map(([k, label]) => (
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
    </div>
  );
}
