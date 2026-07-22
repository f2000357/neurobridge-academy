import { prisma } from "@/lib/prisma";
import { mondayOfStr, todayStr } from "@/lib/time";
import WeekPlanReview, { type PlanData } from "./WeekPlanReview";

export const dynamic = "force-dynamic";

export default async function WeekPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; weekStart?: string }>;
}) {
  const teacher = await prisma.user.findFirst({ include: { children: { orderBy: { name: "asc" } } } });
  if (!teacher || teacher.children.length === 0) {
    return (
      <main className="page">
        <h1>No students yet</h1>
      </main>
    );
  }

  const sp = await searchParams;
  const childId = teacher.children.some((c) => c.id === sp.childId)
    ? sp.childId!
    : teacher.children[0].id;
  const weekStart = sp.weekStart || mondayOfStr(todayStr());

  const plan = await prisma.weeklyPlan.findUnique({
    where: { childId_weekStart: { childId, weekStart } },
    include: { lessons: { orderBy: [{ subject: "asc" }, { order: "asc" }] } },
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
      childrenList={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
      initialChildId={childId}
      initialWeekStart={weekStart}
      initialPlan={initialPlan}
    />
  );
}
