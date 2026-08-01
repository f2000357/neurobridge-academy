import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { addDaysStr, planningWeekStart, todayStr } from "@/lib/time";
import WeekGrid from "./WeekGrid";
import DiagnosticCard from "./DiagnosticCard";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function WeekPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; monday?: string }>;
}) {
  const teacher = await getCurrentUser({
    include: {
      children: { orderBy: { name: "asc" } },
      lessonPlans: { where: { published: true }, orderBy: { updatedAt: "desc" } },
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

  // Deep-linkable: arrive on a specific child + week (e.g. from "Generate the week").
  const sp = await searchParams;
  const childId = kids.some((c) => c.id === sp.childId) ? sp.childId! : kids[0].id;
  const monday = sp.monday || planningWeekStart(todayStr());
  // Seven: a block can live on a Saturday, so the week has to fetch one.
  const dates = Array.from({ length: 7 }, (_, i) => addDaysStr(monday, i));

  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date: { in: dates } },
    include: {
      lessonPlan: { select: { title: true, subject: true } },
      sessions: { select: { state: true } },
    },
    orderBy: { startMin: "asc" },
  });

  // Visiting teachers who can hold a block for one of this guide's learners.
  const childIds = kids.map((c) => c.id);
  const specialists = await prisma.specialistTeacher.findMany({
    where: { archived: false, assignments: { some: { childId: { in: childIds } } } },
    include: { assignments: { where: { childId: { in: childIds } }, select: { childId: true } } },
    orderBy: { name: "asc" },
  });

  // Has a diagnostic already been recorded for this learner?
  const diag = await prisma.assessmentImport.findFirst({
    where: { childId, provider: "ixl-diagnostic" },
    orderBy: { createdAt: "desc" },
    select: { summary: true },
  });

  return (
    <>
      <DiagnosticCard
        childId={childId}
        childName={kids.find((c) => c.id === childId)?.name ?? "this learner"}
        from={todayStr()}
        hasResult={Boolean(diag)}
        resultSummary={diag?.summary}
      />
      <WeekGrid
        childrenList={kids.map((c) => ({ id: c.id, name: c.name }))}
        initialChildId={childId}
        initialMonday={monday}
        plans={teacher.lessonPlans.map((p) => ({
          id: p.id,
          title: p.title,
          subject: p.subject,
          durationMin: p.durationMin,
          childId: p.childId,
        }))}
        specialistList={specialists.map((t) => ({
          id: t.id,
          name: t.name,
          childIds: t.assignments.map((a) => a.childId),
        }))}
        initialSlots={slots.map((s) => ({
          id: s.id,
          kind: s.kind,
          subject: s.subject,
          activity: s.activity,
          teacherId: s.teacherId,
          lessonPlanId: s.lessonPlanId,
          date: s.date,
          startMin: s.startMin,
          endMin: s.endMin,
          lessonPlan: s.lessonPlan ? { title: s.lessonPlan.title, subject: s.lessonPlan.subject } : null,
          sessions: s.sessions.map((x) => ({ state: x.state })),
        }))}
      />
    </>
  );
}
