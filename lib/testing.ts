import { prisma } from "./prisma";
import { addDaysStr, todayStr } from "./time";

// "If they don't take it Friday, they take it Monday morning."
//
// This used to run when the CHILD opened their day, and write a block straight
// into the schedule. So a guide would delete Monday's check-in, the child would
// open their day, and it reappeared — the delete looked broken when what was
// really happening is that a page view was quietly recreating it. A page a
// child looks at should not write to the timetable, and a guide's deletion has
// to mean something.
//
// It answers a question now instead of taking an action: should this be
// offered? The guide decides, on their own Today page.
export async function mondayTestFallbackDue(childId: string): Promise<boolean> {
  const today = todayStr();
  const [y, m, d] = today.split("-").map(Number);
  if (new Date(y, m - 1, d).getDay() !== 1) return false; // Mondays only

  const lastFriday = addDaysStr(today, -3);
  const fridaySlot = await prisma.scheduleSlot.findFirst({
    where: { childId, date: lastFriday, kind: "testing" },
    include: { sessions: { select: { state: true } } },
  });
  if (!fridaySlot) return false; // no Friday test was scheduled → nothing to carry over

  const absentFriday = await prisma.absence.findUnique({
    where: { childId_date: { childId, date: lastFriday } },
  });
  const taken = fridaySlot.sessions.some((s) => s.state === "closed");
  if (taken && !absentFriday) return false; // it was done → no fallback needed

  // Already there, or already recorded? Then there is nothing to offer.
  const existingToday = await prisma.scheduleSlot.findFirst({
    where: { childId, date: today, kind: "testing" },
  });
  if (existingToday) return false;
  const weekTest = await prisma.weeklyTest.findUnique({
    where: { childId_weekStart: { childId, weekStart: today } },
  });
  if (weekTest) return false;

  return true;
}

/** Place it, on the guide's say-so. */
export async function placeMondayTest(childId: string): Promise<void> {
  const today = todayStr();
  const existing = await prisma.scheduleSlot.findFirst({
    where: { childId, date: today, kind: "testing" },
  });
  if (existing) return;
  await prisma.scheduleSlot.create({
    data: { childId, kind: "testing", date: today, startMin: 8 * 60, endMin: 10 * 60 },
  });
}
