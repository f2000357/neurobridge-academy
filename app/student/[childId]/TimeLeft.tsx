"use client";

import { fmtMin } from "@/lib/time";

// How long until the next thing. Deliberately calm: whole minutes, never
// ticking seconds, and soft words near the end. A visible countdown is a
// pressure source for an anxious learner — this is meant to answer "how much
// longer?" without becoming the thing they watch.

export type TimerSlot = {
  id: string;
  startMin: number;
  endMin: number;
  label: string;
  done: boolean;
};

/** `now` is minutes past midnight, owned by DayStrip so both agree. */
export default function TimeLeft({ slots, now }: { slots: TimerSlot[]; now: number }) {
  const state = timerState(slots, now);
  if (!state) return null;

  return (
    <div className="timeleft">
      <div className="timeleft-row">
        <span className="timeleft-main">{state.main}</span>
        {state.aside && <span className="timeleft-next">{state.aside}</span>}
      </div>
      {state.pct != null && (
        <div className="timeleft-bar" aria-hidden="true">
          <span style={{ width: `${state.pct}%` }} />
        </div>
      )}
    </div>
  );
}

export type TimerState = { main: string; aside: string | null; pct: number | null };

/**
 * What the timer should say at a given minute-of-day. Pure, so it can be
 * checked against any clock without rendering.
 */
export function timerState(slots: TimerSlot[], now: number): TimerState | null {
  const live = slots.filter((s) => !s.done);
  const current = live.find((s) => s.startMin <= now && s.endMin > now);
  const upcoming = live.find((s) => s.startMin > now);

  // Nothing running and nothing left — the page already says "All done".
  if (!current && !upcoming) return null;

  if (current) {
    const left = Math.max(0, current.endMin - now);
    const span = Math.max(1, current.endMin - current.startMin);
    return {
      main: phrase(left),
      aside: upcoming ? `then ${upcoming.label}` : null,
      pct: Math.min(100, Math.max(0, ((span - left) / span) * 100)),
    };
  }

  // In a gap between activities.
  const until = Math.max(0, upcoming!.startMin - now);
  return {
    main: until <= 1 ? "Starting now" : `${upcoming!.label} in about ${until} minutes`,
    aside: `at ${fmtMin(upcoming!.startMin)}`,
    pct: null,
  };
}

/** Soft near the end, plain in the middle. Never a bare "0". */
function phrase(left: number): string {
  if (left <= 1) return "Almost time to switch";
  if (left <= 5) return `${left} minutes left — nearly there`;
  return `About ${left} minutes left`;
}
