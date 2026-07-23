import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";
import ScheduleEditor from "./ScheduleEditor";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SchedulePage() {
  const teacher = await getCurrentUser({
    include: {
      children: true,
      lessonPlans: {
        where: { published: true },
        orderBy: { updatedAt: "desc" },
      },
    },
  });

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
  const date = todayStr();
  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date },
    include: { lessonPlan: true, sessions: { select: { state: true } } },
    orderBy: { startMin: "asc" },
  });

  return (
      <ScheduleEditor
        childrenList={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
        plans={teacher.lessonPlans.map((p) => ({
          id: p.id,
          title: p.title,
          subject: p.subject,
          durationMin: p.durationMin,
          childId: p.childId,
        }))}
        initialChildId={childId}
        initialDate={date}
        initialSlots={slots.map((s) => ({
          id: s.id,
          kind: s.kind,
          startMin: s.startMin,
          endMin: s.endMin,
          lessonPlan: s.lessonPlan ? { title: s.lessonPlan.title } : null,
          sessions: s.sessions.map((x) => ({ state: x.state })),
        }))}
      />
  );
}
