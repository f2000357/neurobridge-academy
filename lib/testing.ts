import { prisma } from "./prisma";
import { addDaysStr, todayStr } from "./time";

// "If they don't take it Friday, they take it Monday morning."
// On a Monday, if last Friday's testing block wasn't completed (or the child was
// absent), drop a testing block into this Monday morning.
export async function ensureMondayTestFallback(childId: string): Promise<void> {
  const today = todayStr();
  const [y, m, d] = today.split("-").map(Number);
  if (new Date(y, m - 1, d).getDay() !== 1) return; // Mondays only

  const lastFriday = addDaysStr(today, -3);
  const fridaySlot = await prisma.scheduleSlot.findFirst({
    where: { childId, date: lastFriday, kind: "testing" },
    include: { sessions: { select: { state: true } } },
  });
  if (!fridaySlot) return; // no Friday test was scheduled → nothing to carry over

  const absentFriday = await prisma.absence.findUnique({
    where: { childId_date: { childId, date: lastFriday } },
  });
  const taken = fridaySlot.sessions.some((s) => s.state === "closed");
  if (taken && !absentFriday) return; // it was done → no fallback needed

  // Don't duplicate: already a testing slot today, or the test is already recorded?
  const existingToday = await prisma.scheduleSlot.findFirst({
    where: { childId, date: today, kind: "testing" },
  });
  if (existingToday) return;
  const weekTest = await prisma.weeklyTest.findUnique({
    where: { childId_weekStart: { childId, weekStart: today } },
  });
  if (weekTest) return;

  await prisma.scheduleSlot.create({
    data: { childId, kind: "testing", date: today, startMin: 8 * 60, endMin: 10 * 60 },
  });
}
