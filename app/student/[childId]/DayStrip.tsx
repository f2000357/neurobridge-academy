"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMin, nowMin } from "@/lib/time";
import TimeLeft, { type TimerSlot } from "./TimeLeft";

// The child's day, driven by a live clock — which SHOWS where he is, and no
// longer decides what he may do.
//
// Start used to appear on one block only: the one the clock was inside. So a
// child opening his day at 6pm found nothing startable at all and a banner
// congratulating him for a day he had not done; one opening before the first
// block could not get ahead; and yesterday's unfinished work was simply not on
// the page. A timetable is a plan for the day, not a lock on it.
//
// This used to be rendered once on the server, which meant "Now" stayed on the
// finished block until someone reloaded the page — a child looking at their own
// day would be told to do the thing they just did. One clock lives here and
// decides both which block is current and what the timer says, so the two can
// never disagree.

export type DaySlot = {
  id: string;
  kind: string;
  startMin: number;
  endMin: number;
  main: string;
  sub?: string;
  subj?: string;
  closed: boolean;
  ready?: boolean; // a lesson slot with no plan yet isn't startable
};

const TICK_MS = 10000; // the display is in whole minutes; 10s is plenty

export default function DayStrip({
  slots,
  linkHandle,
}: {
  slots: DaySlot[];
  linkHandle: string;
}) {
  const router = useRouter();
  // Null until mounted so the server and first client render agree.
  const [now, setNow] = useState<number | null>(null);
  const lastIdx = useRef<number | null>(null);

  useEffect(() => {
    setNow(nowMin());
    const t = setInterval(() => setNow(nowMin()), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const effectiveNow = now ?? -1;
  const nowIdx = slots.findIndex((s) => !s.closed && s.endMin > effectiveNow);

  // When the day moves on, pull fresh server state once — the guide may have
  // changed the schedule, and a finished session needs its summary link.
  useEffect(() => {
    if (now == null) return;
    if (lastIdx.current !== null && lastIdx.current !== nowIdx) router.refresh();
    lastIdx.current = nowIdx;
  }, [nowIdx, now, router]);

  const timerSlots: TimerSlot[] = slots.map((s) => ({
    id: s.id,
    startMin: s.startMin,
    endMin: s.endMin,
    label: s.main,
    done: s.closed,
  }));

  return (
    <>
      {now != null && slots.length > 0 && <TimeLeft slots={timerSlots} now={now} />}

      <div className="strip">
        {slots.map((slot, i) => {
          // Before the clock arrives, nothing is highlighted — better a plain
          // list for one frame than the wrong block marked "Now".
          // Finished means finished. Time passing is not doing the work — the
          // old rule greyed out a whole morning nobody had touched.
          const isDone = slot.closed;
          // Its hour has been and gone, and it is still not done.
          const isMissed = now != null && !slot.closed && slot.endMin <= effectiveNow;
          const isNow = now != null && i === nowIdx;
          const isNext = now != null && i === nowIdx + 1 && nowIdx !== -1;
          return (
            <div
              key={slot.id}
              className={`slot ${isDone ? "done" : ""} ${isNow ? "now" : ""} ${
                isMissed ? "missed" : ""
              } ${
                slot.kind === "lesson" ? `subj-${slot.subj ?? "other"}` : `k-${slot.kind}`
              }`}
            >
              <span className="time">
                {fmtMin(slot.startMin)} – {fmtMin(slot.endMin)}
              </span>
              <span className="name">
                <span className="subj">{slot.main}</span>
                {slot.sub && <span className="topic">{slot.sub}</span>}
              </span>
              {isNow && <span className="badge now">Now</span>}
              {isNext && <span className="badge next">Next</span>}
              {/* Startable whenever he opens it: early, late, or right on time.
                  The badges above still say where the day is up to. */}
              {!isDone && slot.kind === "lesson" && slot.ready !== false && (
                <Link href={`/student/${linkHandle}/session/${slot.id}`} className={`btn ${isNow ? "" : "quiet"}`}>
                  {isNow ? "Start" : isMissed ? "Do it now" : "Start early"}
                </Link>
              )}
              {!isDone && slot.kind === "lesson" && slot.ready === false && (
                <span className="badge next">Getting ready</span>
              )}
              {!isDone && slot.kind === "testing" && (
                <Link href={`/student/${linkHandle}/test/${slot.id}`} className={`btn ${isNow ? "" : "quiet"}`}>
                  {isNow ? "Start" : "Do it now"}
                </Link>
              )}
              {isDone && slot.kind === "lesson" && slot.closed && (
                <Link href={`/student/${linkHandle}/summary/${slot.id}`} className="chip">
                  See how I did →
                </Link>
              )}
            </div>
          );
        })}
      </div>

      {/* Only when it is actually true. This used to fire the moment the last
          block's hour passed, congratulating a child on a day he had not
          started — and leaving him nothing to press. */}
      {now != null && slots.length > 0 && slots.every((s) => s.closed || s.kind !== "lesson") && (
        <div className="card" style={{ marginTop: 24, background: "var(--warm-soft)", border: "none" }}>
          <strong>All done for today!</strong>{" "}
          <span className="muted">You worked through your whole list. 🎉</span>
        </div>
      )}
    </>
  );
}
