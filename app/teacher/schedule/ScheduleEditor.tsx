"use client";

import { useCallback, useEffect, useState } from "react";
import { fmtMin, hhmmToMin } from "@/lib/time";

type Plan = { id: string; title: string; subject: string; durationMin: number; childId: string | null };
type Child = { id: string; name: string };
type Slot = {
  id: string;
  kind: string;
  startMin: number;
  endMin: number;
  lessonPlan: { title: string } | null;
  sessions: { state: string }[];
};

const KIND_LABEL: Record<string, string> = {
  lesson: "Lesson",
  testing: "Testing (weekly check-in)",
  one_on_one: "1:1 with you",
  flexible: "Flexible period",
  break: "Break / Lunch",
  free_time: "Free time",
};

export default function ScheduleEditor({
  childrenList,
  plans,
  initialChildId,
  initialDate,
  initialSlots,
}: {
  childrenList: Child[];
  plans: Plan[];
  initialChildId: string;
  initialDate: string;
  initialSlots: Slot[];
}) {
  const [childId, setChildId] = useState(initialChildId);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  const [absent, setAbsent] = useState(false);

  // New-slot form
  const [kind, setKind] = useState("lesson");
  const [planId, setPlanId] = useState("");
  const [start, setStart] = useState("09:00");
  const [duration, setDuration] = useState(45);

  const availablePlans = plans.filter((p) => !p.childId || p.childId === childId);

  const refresh = useCallback(async (cId: string, d: string) => {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "list", childId: cId, date: d }),
    });
    const data = await res.json();
    setSlots(data.slots ?? []);
    setAbsent(Boolean(data.absent));
  }, []);

  async function toggleAbsent() {
    const next = !absent;
    setAbsent(next);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "setAbsent", childId, date, absent: next }),
    });
  }

  useEffect(() => {
    void refresh(childId, date);
  }, [childId, date, refresh]);

  // When a lesson plan is chosen, default the duration to the plan's length.
  useEffect(() => {
    if (kind === "lesson" && planId) {
      const p = plans.find((x) => x.id === planId);
      if (p) setDuration(p.durationMin);
    }
  }, [planId, kind, plans]);

  async function addSlot() {
    setNote(null);
    const startMin = hhmmToMin(start);
    const endMin = startMin + Number(duration);
    if (kind === "lesson" && !planId) {
      setNote("Choose a lesson to schedule, or pick a different slot type.");
      return;
    }
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "add",
        childId,
        date,
        kind,
        lessonPlanId: planId,
        startMin,
        endMin,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    await refresh(childId, date);
  }

  function askCopyToAll() {
    setNote(null);
    if (slots.length === 0) {
      setNote("This day is empty — add some slots before sharing it.");
      return;
    }
    if (childrenList.length < 2) {
      setNote("There is only one student, so there is no one to share with.");
      return;
    }
    setConfirmingCopy(true);
  }

  async function copyToAll() {
    setConfirmingCopy(false);
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "copyToAll", childId, date }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    const summary = (data.results as { name: string; added: number; skipped: number }[])
      .map((r) => `${r.name}: added ${r.added}${r.skipped ? `, skipped ${r.skipped} (time taken)` : ""}`)
      .join(" · ");
    setNote(`Shared to all students. ${summary}`);
  }

  async function removeSlot(id: string, hasSessions: boolean) {
    if (hasSessions && !confirm("This slot has lesson work recorded. Remove it anyway?")) return;
    setBusy(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "remove", id }),
    });
    setBusy(false);
    await refresh(childId, date);
  }

  const child = childrenList.find((c) => c.id === childId);

  return (
    <main className="page wrap" style={{ maxWidth: 760 }}>
      <p className="eyebrow">Schedule</p>
      <h1>Plan a day</h1>
      <p className="muted">
        Place lessons and periods onto a child&apos;s day. They see it as their calm, one-thing-at-a-time list.
      </p>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="row">
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
          <label className="inline muted">
            Day
            <input
              className="field short"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <button
            className={`chip ${absent ? "on" : ""}`}
            onClick={toggleAbsent}
            aria-pressed={absent}
            style={absent ? { borderColor: "var(--warm)", color: "var(--warm)", background: "var(--warm-soft)" } : {}}
          >
            {absent ? "✓ Marked absent" : "Mark absent"}
          </button>
        </div>
        {absent && (
          <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
            {child?.name} is marked absent this day. Their lessons are paused, and any Friday test
            carries to Monday.
          </p>
        )}
      </div>

      <div className="row" style={{ justifyContent: "space-between", marginTop: 28, marginBottom: 14 }}>
        <h2 style={{ margin: 0 }}>{child?.name}&apos;s day</h2>
        {childrenList.length > 1 && !confirmingCopy && (
          <button className="btn quiet" onClick={askCopyToAll} disabled={busy}>
            Copy this day to all students
          </button>
        )}
      </div>

      {confirmingCopy && (
        <div className="card lift" style={{ marginBottom: 14, background: "var(--accent-soft)" }}>
          <p style={{ margin: "0 0 12px" }}>
            Copy {child?.name}&apos;s day to the other {childrenList.length - 1} student
            {childrenList.length - 1 > 1 ? "s" : ""}? Their existing slots stay — only free times
            get filled. A lesson made just for {child?.name} becomes flexible time for the others.
          </p>
          <div className="row">
            <button className="btn" onClick={copyToAll} disabled={busy}>
              Yes, share this day
            </button>
            <button className="btn quiet" onClick={() => setConfirmingCopy(false)} disabled={busy}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="stack">
        {slots.length === 0 && <p className="muted">Nothing scheduled yet. Add the first slot below.</p>}
        {slots.map((s) => (
          <div key={s.id} className="slot">
            <span className="time">
              {fmtMin(s.startMin)} – {fmtMin(s.endMin)}
            </span>
            <span className="name">
              {s.kind === "lesson" ? s.lessonPlan?.title ?? "Lesson" : KIND_LABEL[s.kind] ?? s.kind}
            </span>
            {s.sessions.some((x) => x.state === "closed") && <span className="badge now">done</span>}
            <button
              className="chip"
              onClick={() => removeSlot(s.id, s.sessions.length > 0)}
              disabled={busy}
              aria-label="Remove slot"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="card lift" style={{ marginTop: 20 }}>
        <h2>Add to the day</h2>
        <div className="stack">
          <div className="row">
            <label className="inline muted">
              Type
              <select className="field short" value={kind} onChange={(e) => setKind(e.target.value)}>
                {Object.entries(KIND_LABEL).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            {kind === "lesson" && (
              <label className="inline muted">
                Lesson
                <select className="field short" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="">Choose a lesson…</option>
                  {availablePlans.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <div className="row">
            <label className="inline muted">
              Start
              <input
                className="field short"
                type="time"
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="inline muted">
              Minutes
              <input
                className="field tiny"
                type="number"
                min={5}
                max={120}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
              />
            </label>
            <span className="muted" style={{ fontSize: "0.85rem" }}>
              ends {fmtMin(hhmmToMin(start) + Number(duration))}
            </span>
            <button className="btn" onClick={addSlot} disabled={busy}>
              Add to day
            </button>
          </div>
          {availablePlans.length === 0 && kind === "lesson" && (
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              No lessons available for {child?.name}. Create one in the lesson builder first.
            </p>
          )}
        </div>
      </div>

      {note && (
        <p className="muted" style={{ marginTop: 12 }} role="status">
          {note}
        </p>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: "0.85rem" }}>
        Tip: a typical day is four 45-minute lessons plus two flexible periods. You can copy this shape to each day.
      </p>
    </main>
  );
}
