import { prisma } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import CenterConsole from "./CenterConsole";

export const dynamic = "force-dynamic";

const mode = (arr: string[]): string => {
  if (arr.length === 0) return "";
  const counts: Record<string, number> = {};
  for (const g of arr) counts[g] = (counts[g] ?? 0) + 1;
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
};

export default async function CenterHome() {
  const me = await getCurrentUser();
  const centerId = me?.centerId ?? "";

  const [kids, archivedKids, notes, gradeSlots, homework, guides] = await Promise.all([
    prisma.child.findMany({
      where: { centerId, archived: false },
      include: { teacher: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.child.findMany({
      where: { centerId, archived: true },
      select: { id: true, name: true, username: true, teacher: { select: { name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.progressNote.findMany({
      where: { session: { child: { centerId } }, score: { not: null } },
      select: { score: true, session: { select: { childId: true } } },
    }),
    prisma.scheduleSlot.findMany({
      where: { child: { centerId }, lessonPlan: { gradeLevel: { not: "" } } },
      select: { childId: true, lessonPlan: { select: { gradeLevel: true } } },
    }),
    prisma.homework.findMany({ where: { child: { centerId } }, select: { childId: true, status: true } }),
    prisma.user.findMany({ where: { centerId, role: "guide" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);

  const scoresByKid: Record<string, number[]> = {};
  for (const n of notes) {
    if (n.score != null) (scoresByKid[n.session.childId] ??= []).push(n.score);
  }
  const gradesByKid: Record<string, string[]> = {};
  for (const s of gradeSlots) {
    if (s.lessonPlan?.gradeLevel) (gradesByKid[s.childId] ??= []).push(s.lessonPlan.gradeLevel);
  }
  const hwByKid: Record<string, { done: number; total: number }> = {};
  for (const h of homework) {
    const b = (hwByKid[h.childId] ??= { done: 0, total: 0 });
    b.total += 1;
    if (h.status === "completed") b.done += 1;
  }

  const rows = kids.map((c) => {
    const scores = scoresByKid[c.id] ?? [];
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const hw = hwByKid[c.id] ?? { done: 0, total: 0 };
    return {
      id: c.id,
      name: c.name,
      username: c.username ?? c.id,
      age: c.age ?? null,
      guideId: c.teacher.id,
      guideName: c.teacher.name,
      grade: mode(gradesByKid[c.id] ?? []),
      mastery: avg,
      balance: c.points - c.pointsSpent,
      hwDone: hw.done,
      hwTotal: hw.total,
    };
  });

  const archived = archivedKids.map((c) => ({
    id: c.id,
    name: c.name,
    username: c.username ?? c.id,
    guideName: c.teacher.name,
  }));

  return <CenterConsole rows={rows} guides={guides} archived={archived} />;
}
