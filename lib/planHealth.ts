import { prisma } from "./prisma";
import { addDaysStr, todayStr, mondayOfStr } from "./time";

// Is the plan still keeping up?
//
// Two ways it stops, and both used to be silent:
//
//   • the child falls behind, and carried work quietly stops fitting
//   • the week runs out, and nothing says so until the child opens Monday to
//     empty blocks — the worst possible discovery path, because the person who
//     finds out is the one who can't fix it
//
// Neither is a crash, so nothing surfaced. This is what a guide needs told.

export type PlanHealth = {
  /** Lessons the child never reached, ever. */
  notReached: number;
  /** Of those, how many are recent enough to still be carried forward. */
  carryable: number;
  /** Lesson blocks next week with no lesson attached. */
  nextWeekEmpty: number;
  /** Next week has blocks but nothing planned in them. */
  nextWeekNeedsPlanning: boolean;
  nextWeekStart: string;
};

const CARRY_WINDOW_DAYS = 7;

export async function planHealth(childId: string): Promise<PlanHealth> {
  const today = todayStr();
  const nextWeekStart = addDaysStr(mondayOfStr(today), 7);
  const nextWeekDates = Array.from({ length: 5 }, (_, i) => addDaysStr(nextWeekStart, i));

  const [missed, nextWeekSlots] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: {
        childId,
        date: { lt: today },
        kind: "lesson",
        lessonPlanId: { not: null },
        sessions: { none: { state: "closed" } },
      },
      select: { date: true },
    }),
    prisma.scheduleSlot.findMany({
      where: { childId, date: { in: nextWeekDates }, kind: "lesson" },
      select: { lessonPlanId: true },
    }),
  ]);

  const windowStart = addDaysStr(today, -CARRY_WINDOW_DAYS);
  const nextWeekEmpty = nextWeekSlots.filter((s) => !s.lessonPlanId).length;

  return {
    notReached: missed.length,
    carryable: missed.filter((m) => m.date >= windowStart).length,
    nextWeekEmpty,
    // Blocks exist but none has a lesson: the week is set up and unplanned,
    // which is the case worth prompting about. No blocks at all is a different
    // problem — the guide hasn't built the week yet — and the schedule page
    // already says so.
    nextWeekNeedsPlanning: nextWeekSlots.length > 0 && nextWeekEmpty === nextWeekSlots.length,
    nextWeekStart,
  };
}
