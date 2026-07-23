import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDaysStr, mondayOfStr, todayStr } from "@/lib/time";
import WeekGrid from "./WeekGrid";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WeekPage() {
  const teacher = await getCurrentUser({ include: { children: true } });
  if (!teacher || teacher.children.length === 0) {
    return (
      <main className="page wrap">
        <h1>No students yet</h1>
        <p className="muted">
          <Link href="/teacher">Back to console</Link>
        </p>
      </main>
    );
  }

  const childId = teacher.children[0].id;
  const monday = mondayOfStr(todayStr());
  const dates = Array.from({ length: 5 }, (_, i) => addDaysStr(monday, i));

  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date: { in: dates } },
    include: {
      lessonPlan: { select: { title: true, subject: true } },
      sessions: { select: { state: true } },
    },
    orderBy: { startMin: "asc" },
  });

  return (
      <WeekGrid
        childrenList={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
        initialChildId={childId}
        initialMonday={monday}
        initialSlots={slots.map((s) => ({
          id: s.id,
          kind: s.kind,
          date: s.date,
          startMin: s.startMin,
          endMin: s.endMin,
          lessonPlan: s.lessonPlan ? { title: s.lessonPlan.title, subject: s.lessonPlan.subject } : null,
          sessions: s.sessions.map((x) => ({ state: x.state })),
        }))}
      />
  );
}
