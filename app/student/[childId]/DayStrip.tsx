"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { fmtMin, nowMin } from "@/lib/time";
import TimeLeft, { type TimerSlot } from "./TimeLeft";

// The child's day, driven by a live clock.
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

  const timerSlots: TimerSlot[] = slots.map((s, i) => ({
    id: s.id,
    startMin: s.startMin,
    endMin: s.endMin,
    label: s.main,
    done: s.closed || (nowIdx === -1 ? s.endMin <= effectiveNow : i < nowIdx),
  }));

  return (
    <>
      {now != null && slots.length > 0 && <TimeLeft slots={timerSlots} now={now} />}

      <div className="strip">
        {slots.map((slot, i) => {
          // Before the clock arrives, nothing is highlighted — better a plain
          // list for one frame than the wrong block marked "Now".
          const isDone =
            now == null
              ? slot.closed
              : slot.closed || (nowIdx === -1 ? slot.endMin <= effectiveNow : i < nowIdx);
          const isNow = now != null && i === nowIdx;
          const isNext = now != null && i === nowIdx + 1 && nowIdx !== -1;
          return (
            <div
              key={slot.id}
              className={`slot ${isDone ? "done" : ""} ${isNow ? "now" : ""} ${
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
              {isNow && slot.kind === "lesson" && slot.ready !== false && (
                <Link href={`/student/${linkHandle}/session/${slot.id}`} className="btn">
                  Start
                </Link>
              )}
              {isNow && slot.kind === "lesson" && slot.ready === false && (
                <span className="badge next">Getting ready</span>
              )}
              {isNow && slot.kind === "testing" && (
                <Link href={`/student/${linkHandle}/test/${slot.id}`} className="btn">
                  Start
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

      {now != null && nowIdx === -1 && slots.length > 0 && (
        <div className="card" style={{ marginTop: 24, background: "var(--warm-soft)", border: "none" }}>
          <strong>All done for today!</strong>{" "}
          <span className="muted">You worked through your whole list. 🎉</span>
        </div>
      )}
    </>
  );
}
