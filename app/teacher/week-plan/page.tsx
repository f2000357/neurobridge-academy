import { prisma } from "@/lib/prisma";
import { planningWeekStart, todayStr } from "@/lib/time";
import WeekPlanReview, { type PlanData } from "./WeekPlanReview";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function WeekPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; weekStart?: string }>;
}) {
  const teacher = await getCurrentUser({ include: { children: { orderBy: { name: "asc" } } } });
  const kids = teacher ? await rosterChildren(teacher) : [];
  if (!teacher || kids.length === 0) {
    return (
      <main className="page">
        <h1>No students yet</h1>
      </main>
    );
  }

  const sp = await searchParams;
  const childId = kids.some((c) => c.id === sp.childId)
    ? sp.childId!
    : kids[0].id;
  const weekStart = sp.weekStart || planningWeekStart(todayStr());

  const plan = await prisma.weeklyPlan.findUnique({
    where: { childId_weekStart: { childId, weekStart } },
    // Ordered by the DAY, not by `order`.
    //
    // `order` is assigned per generation batch, so regenerating a single empty
    // block gives that lesson order 0 — colliding with whatever already held 0,
    // and the tie resolved however the database felt. The week showed Mon, Thu,
    // Tue, Wed, Fri.
    //
    // The day is the ramp anyway: these lessons are laid out across the week in
    // rising difficulty, so date and time already carry the sequence and cannot
    // collide.
    include: { lessons: { orderBy: [{ subject: "asc" }, { date: "asc" }, { order: "asc" }] } },
  });

  const initialPlan: PlanData | null = plan
    ? {
        id: plan.id,
        status: plan.status,
        lessons: plan.lessons.map((l) => ({
          id: l.id,
          subject: l.subject,
          focus: l.focus,
          date: l.date,
          order: l.order,
          level: l.level,
          topic: l.topic,
          standardCode: l.standardCode,
          title: l.title,
          rationale: l.rationale,
          status: l.status,
          lessonPlanId: l.lessonPlanId,
        })),
      }
    : null;

  return (
    <WeekPlanReview
      childrenList={kids.map((c) => ({ id: c.id, name: c.name }))}
      initialChildId={childId}
      initialWeekStart={weekStart}
      initialPlan={initialPlan}
    />
  );
}
