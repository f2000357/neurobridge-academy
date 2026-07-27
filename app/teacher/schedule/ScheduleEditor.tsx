"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { mondayOfStr } from "@/lib/time";
import { START_OPTIONS } from "@/lib/dayTemplate";
import ScheduleTabs from "./ScheduleTabs";
import DayCalendar, { type CalSlot } from "./DayCalendar";
import SessionNote, { type NoteTarget } from "./SessionNote";
import { activityLabel } from "@/lib/activities";

type Plan = { id: string; title: string; subject: string; durationMin: number; childId: string | null };
type Child = { id: string; name: string; dayStartMin: number };
type Slot = CalSlot;

export default function ScheduleEditor({
  childrenList,
  plans,
  initialChildId,
  initialDate,
  initialSlots,
  specialistList = [],
}: {
  childrenList: Child[];
  plans: Plan[];
  initialChildId: string;
  initialDate: string;
  initialSlots: Slot[];
  /** Visiting teachers, with the learners each is assigned to. */
  specialistList?: { id: string; name: string; childIds: string[] }[];
}) {
  const router = useRouter();
  const [childId, setChildId] = useState(initialChildId);
  const [date, setDate] = useState(initialDate);
  const [slots, setSlots] = useState<Slot[]>(initialSlots);
  // Only the specialists assigned to the learner currently being scheduled.
  const specialists = specialistList.filter((t) => t.childIds.includes(childId));
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [confirmingCopy, setConfirmingCopy] = useState(false);
  // The child's configurable school-day start (day always ends 3pm).
  const [dayStart, setDayStart] = useState(
    childrenList.find((c) => c.id === initialChildId)?.dayStartMin ?? 540
  );

  const refresh = useCallback(async (cId: string, d: string) => {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "list", childId: cId, date: d }),
    });
    const data = await res.json();
    setSlots(data.slots ?? []);
  }, []);

  useEffect(() => {
    void refresh(childId, date);
  }, [childId, date, refresh]);

  // Follow the selected child's saved start.
  useEffect(() => {
    const c = childrenList.find((x) => x.id === childId);
    if (c) setDayStart(c.dayStartMin);
  }, [childId, childrenList]);

  async function changeDayStart(min: number) {
    setDayStart(min);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "setDayStart", childId, startMin: min }),
    });
  }

  async function generate(op: "generateDay" | "generateWeek") {
    setBusy(true);
    setNote(null);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op,
        childId,
        date,
        weekStart: mondayOfStr(date),
        startMin: dayStart,
      }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return;
    }
    if (op === "generateDay") {
      setNote(
        `Typical day added — ${data.added} block${data.added === 1 ? "" : "s"}${
          data.skipped ? `, ${data.skipped} skipped (that time was taken)` : ""
        }.`
      );
      await refresh(childId, date);
    } else {
      // The whole week isn't visible on the one-day view — jump to the Week
      // calendar (this child, this week) so the guide sees what was created.
      router.push(`/teacher/week?childId=${childId}&monday=${mondayOfStr(date)}`);
    }
  }

  // ── calendar actions (drag to move, ✕ to delete, click to add) ──────────
  async function moveSlot(id: string, startMin: number, endMin: number) {
    setNote(null);
    // Optimistic — snap it into place, reconcile with the server after.
    setSlots((prev) => prev.map((s) => (s.id === id ? { ...s, startMin, endMin } : s)));
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "update", id, date, startMin, endMin }),
    });
    const data = await res.json();
    if (!data.ok) {
      setNote(data.error === "overlap" ? "That time is taken — moved it back." : "Could not move that block.");
      await refresh(childId, date);
    }
  }

  // Who is running one session. Per block: three piano teachers across three
  // slots is a normal week, and only the person on a block may write it up.
  // A guide writing up a session they ran themselves.
  const [noteTarget, setNoteTarget] = useState<NoteTarget | null>(null);

  function openNote(slot: Slot) {
    setNoteTarget({
      slotId: slot.id,
      label: activityLabel(slot.activity) ?? "Session",
      date,
      childId,
      noteId: null,
      existing: null,
    });
  }

  async function assignSlot(slot: Slot, teacherId: string) {
    setNote(null);
    setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, teacherId: teacherId || null } : s)));
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        op: "update",
        id: slot.id,
        date,
        startMin: slot.startMin,
        endMin: slot.endMin,
        teacherId,
      }),
    });
    const data = await res.json();
    if (!data.ok) {
      setNote("Could not change who is running that block.");
      await refresh(childId, date);
    }
  }

  async function deleteSlot(slot: Slot) {
    if (slot.sessions.length > 0 && !confirm("This block has lesson work recorded. Remove it anyway?")) return;
    setBusy(true);
    await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "remove", id: slot.id }),
    });
    setBusy(false);
    await refresh(childId, date);
  }

  async function addBlock(payload: {
    kind: string;
    subject: string;
    activity: string;
    lessonPlanId: string;
    teacherId: string | null;
    startMin: number;
    endMin: number;
  }): Promise<boolean> {
    setNote(null);
    setBusy(true);
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ op: "add", childId, date, ...payload }),
    });
    const data = await res.json();
    setBusy(false);
    if (data.error) {
      setNote(data.error);
      return false;
    }
    await refresh(childId, date);
    return true;
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

  const child = childrenList.find((c) => c.id === childId);

  return (
    <main className="page wrap" style={{ maxWidth: 760 }}>
      <ScheduleTabs active="day" />
      <p className="eyebrow">Schedule · one day</p>
      <h1>Plan a day</h1>
      <p className="muted">
        Set the <strong>blocks</strong> — when Math, Reading, breaks and electives happen. This is the
        timetable; the actual lessons that fill each Education block come from <strong>Weekly lessons</strong>.
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
        </div>
        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
          Day off? Just clear or move this day&apos;s blocks below — an empty day shows the child a calm
          &ldquo;nothing on your list&rdquo; screen.
        </p>
      </div>

      <div className="card lift" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h2 style={{ margin: "0 0 4px" }}>Quick-fill a typical day</h2>
            <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
              Mandatory Education blocks in the morning, then lunch, a game slot, and
              extracurriculars until 3pm. Doesn&apos;t touch slots you&apos;ve already placed.
            </p>
          </div>
          <label className="inline muted">
            Day starts
            <select
              className="field short"
              value={dayStart}
              onChange={(e) => changeDayStart(Number(e.target.value))}
            >
              {START_OPTIONS.map((o) => (
                <option key={o.min} value={o.min}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn" onClick={() => generate("generateDay")} disabled={busy}>
            ✦ Generate this day
          </button>
          <button className="btn quiet" onClick={() => generate("generateWeek")} disabled={busy}>
            Generate the whole week (empty days)
          </button>
        </div>
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
      <DayCalendar
        childId={childId}
        slots={slots}
        plans={plans}
        specialists={specialists}
        dayStartMin={dayStart}
        busy={busy}
        onMove={moveSlot}
        onAssign={assignSlot}
        onNote={openNote}
        onDelete={deleteSlot}
        onAdd={addBlock}
      />

      {noteTarget && <SessionNote target={noteTarget} onClose={() => setNoteTarget(null)} />}

      {note && (
        <p className="muted" style={{ marginTop: 12 }} role="status">
          {note}
        </p>
      )}

      <p className="muted" style={{ marginTop: 24, fontSize: "0.85rem" }}>
        Tip: Education blocks carry a subject (Math, Reading…) but no content until you run
        <strong> Weekly lessons</strong>. Drag blocks to rearrange the day; the child sees it as a calm,
        one-thing-at-a-time list.
      </p>
    </main>
  );
}
