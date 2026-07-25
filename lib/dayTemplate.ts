// A "typical day" the guide can lay down in one click. The day always ends at
// 3:00pm; the start is configurable per child (9:00 / 9:30 / 10:00). The shape
// is deterministic: four MANDATORY Education blocks front-loaded in the morning
// (best focus), a morning movement break, a catch-up flexible, lunch, one game-
// play slot, and extracurriculars filling the afternoon to 3pm.
//
// For a later start the day is shorter, so blocks are trimmed from the END
// (extracurriculars go first) — the Education blocks and lunch always survive.

export const BLOCK = 30; // the day runs in 30-minute blocks
export const DAY_END = 15 * 60; // 3:00pm — school ends

export const START_OPTIONS = [
  { min: 9 * 60, label: "9:00 am" },
  { min: 9 * 60 + 30, label: "9:30 am" },
  { min: 10 * 60, label: "10:00 am" },
];

// The four mandatory Education subjects, in morning order.
export const CORE_SUBJECTS = ["math", "reading", "writing", "science"];
// One dedicated game-play slot.
const GAME_ACTIVITY = "computer_games";

export type DayBlock = {
  kind: string; // lesson | break | flexible
  subject?: string; // for Education (lesson) blocks
  activity?: string; // for flexible / extracurricular blocks
  startMin: number;
  endMin: number;
};

// The ideal ordered day (each entry = one 30-minute block). Walked from the
// chosen start; anything that would run past 3:00pm is dropped from the tail.
function idealSequence(): { kind: string; subject?: string; activity?: string }[] {
  return [
    { kind: "lesson", subject: "math" }, // ── mandatory Education ──
    { kind: "lesson", subject: "reading" },
    { kind: "break" }, // morning movement / snack
    { kind: "lesson", subject: "writing" },
    { kind: "lesson", subject: "science" },
    { kind: "flexible" }, // catch-up / finish-up (no set activity)
    { kind: "break" }, // lunch
    { kind: "flexible", activity: "art" }, // ── extracurriculars ──
    { kind: "flexible", activity: "music" },
    { kind: "flexible", activity: GAME_ACTIVITY }, // the game-play slot
    { kind: "flexible", activity: "sports" },
    { kind: "flexible", activity: "outdoor" },
    { kind: "flexible", activity: "experiments" },
    { kind: "flexible", activity: "chess" },
  ];
}

/** The blocks that make up a typical day, starting at `startMin`, ending by 3pm. */
export function buildDayTemplate(startMin: number, endMin: number = DAY_END): DayBlock[] {
  const blocks: DayBlock[] = [];
  let t = startMin;
  for (const item of idealSequence()) {
    if (t + BLOCK > endMin) break;
    blocks.push({ ...item, startMin: t, endMin: t + BLOCK });
    t += BLOCK;
  }
  return blocks;
}

/** Snap an arbitrary minute value to the nearest allowed start option. */
export function normalizeStart(min: number | null | undefined): number {
  const v = min ?? START_OPTIONS[0].min;
  const allowed = START_OPTIONS.map((o) => o.min);
  return allowed.includes(v) ? v : START_OPTIONS[0].min;
}
