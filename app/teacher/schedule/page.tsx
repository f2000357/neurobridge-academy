import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";
import ScheduleEditor from "./ScheduleEditor";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";

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

  const kids = teacher ? await rosterChildren(teacher) : [];
  if (!teacher || kids.length === 0) {
    return (
      <main className="page wrap">
        <h1>No students yet</h1>
        <p className="muted">
          <Link href="/teacher">Back to console</Link>
        </p>
      </main>
    );
  }

  const childId = kids[0].id;
  const date = todayStr();
  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date },
    include: { lessonPlan: true, sessions: { select: { state: true } } },
    orderBy: { startMin: "asc" },
  });

  // Visiting teachers who can hold a block for one of this guide's learners.
  const childIds = kids.map((c) => c.id);
  const specialists = await prisma.specialistTeacher.findMany({
    where: { archived: false, assignments: { some: { childId: { in: childIds } } } },
    include: { assignments: { where: { childId: { in: childIds } }, select: { childId: true } } },
    orderBy: { name: "asc" },
  });

  return (
      <ScheduleEditor
        specialistList={specialists.map((t) => ({
          id: t.id,
          name: t.name,
          childIds: t.assignments.map((a) => a.childId),
        }))}
        childrenList={kids.map((c) => ({ id: c.id, name: c.name, dayStartMin: c.dayStartMin }))}
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
          subject: s.subject,
          activity: s.activity,
          teacherId: s.teacherId,
          lessonPlanId: s.lessonPlanId,
          startMin: s.startMin,
          endMin: s.endMin,
          lessonPlan: s.lessonPlan ? { title: s.lessonPlan.title, subject: s.lessonPlan.subject } : null,
          sessions: s.sessions.map((x) => ({ state: x.state })),
        }))}
      />
  );
}
