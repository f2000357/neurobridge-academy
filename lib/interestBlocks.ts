import { prisma } from "./prisma";
import { addDaysStr } from "./time";

// Placing a family's special-interest blocks into a week.
//
// Mornings stay academic-heavy, so interests are placed from the afternoon
// backwards; only if the afternoon is full do we fall back to the morning.
// The guide can move or cancel anything afterwards — this is a starting point,
// not a lock.

const BLOCK = 30; // the day runs in 30-minute blocks
const DAY_END = 15 * 60;
const AFTERNOON = 12 * 60 + 30; // prefer interests from here on
const WEEKDAYS = 5;

type Busy = { startMin: number; endMin: number };

/** Earliest free run of `slots` blocks on a day, at or after `from`. */
function findWindow(busy: Busy[], slots: number, from: number): number | null {
  const need = slots * BLOCK;
  for (let start = from; start + need <= DAY_END; start += BLOCK) {
    const end = start + need;
    const clash = busy.some((b) => start < b.endMin && end > b.startMin);
    if (!clash) return start;
  }
  return null;
}

export type PlacedBlock = { date: string; startMin: number; endMin: number; activity: string };

/**
 * Work out where this child's interest blocks should go in the given week.
 * Returns the slots to create; it does not write anything.
 */
export async function planInterestBlocks(
  childId: string,
  weekStart: string
): Promise<PlacedBlock[]> {
  const interests = await prisma.childInterest.findMany({ where: { childId } });
  if (interests.length === 0) return [];

  // Respect the child's configurable school-day start — never place before it.
  const child = await prisma.child.findUnique({ where: { id: childId }, select: { dayStartMin: true } });
  const DAY_START = child?.dayStartMin ?? 9 * 60;

  const dates = Array.from({ length: WEEKDAYS }, (_, i) => addDaysStr(weekStart, i));
  const existing = await prisma.scheduleSlot.findMany({
    where: { childId, date: { in: dates } },
    select: { date: true, startMin: true, endMin: true },
  });

  // Track occupancy per day, growing as we place.
  const busyByDate = new Map<string, Busy[]>();
  for (const d of dates) busyByDate.set(d, []);
  for (const s of existing) busyByDate.get(s.date)?.push({ startMin: s.startMin, endMin: s.endMin });

  const placed: PlacedBlock[] = [];
  // Round-robin the starting day so interests spread across the week rather
  // than stacking onto Monday.
  let dayCursor = 0;

  for (const it of interests) {
    const sessions = Math.max(1, it.sessionsPerWeek);
    const slots = Math.max(1, it.slotsPerSession);

    for (let s = 0; s < sessions; s++) {
      let put = false;
      // Try each day once, starting from the cursor, so two sessions of the
      // same interest land on different days.
      for (let attempt = 0; attempt < WEEKDAYS && !put; attempt++) {
        const date = dates[(dayCursor + attempt) % WEEKDAYS];
        const busy = busyByDate.get(date)!;
        // Skip a day that already has this interest, so sessions spread out.
        if (placed.some((p) => p.date === date && p.activity === it.activity)) continue;

        if (it.backToBack) {
          const start = findWindow(busy, slots, AFTERNOON) ?? findWindow(busy, slots, DAY_START);
          if (start == null) continue;
          const end = start + slots * BLOCK;
          busy.push({ startMin: start, endMin: end });
          placed.push({ date, startMin: start, endMin: end, activity: it.activity });
          put = true;
        } else {
          // Same day, but the blocks needn't touch.
          const starts: number[] = [];
          for (let k = 0; k < slots; k++) {
            const st = findWindow(busy, 1, AFTERNOON) ?? findWindow(busy, 1, DAY_START);
            if (st == null) break;
            busy.push({ startMin: st, endMin: st + BLOCK });
            starts.push(st);
          }
          if (starts.length === 0) continue;
          for (const st of starts) {
            placed.push({ date, startMin: st, endMin: st + BLOCK, activity: it.activity });
          }
          put = true;
        }
      }
      dayCursor = (dayCursor + 1) % WEEKDAYS;
    }
  }

  return placed;
}
