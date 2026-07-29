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

  // Which of these the child has actually finished. The plan's own status only
  // knows whether a lesson was scheduled — not whether he sat and did it, and
  // certainly not that he pulled Thursday's maths forward and finished it on
  // Tuesday. A closed session on any slot using that lesson is the truth.
  const planIds = (plan?.lessons ?? []).map((l) => l.lessonPlanId).filter(Boolean) as string[];
  const doneSlots = planIds.length
    ? await prisma.scheduleSlot.findMany({
        where: { childId, lessonPlanId: { in: planIds }, sessions: { some: { state: "closed" } } },
        select: { id: true, lessonPlanId: true },
      })
    : [];
  // The child pressing "I did it" is a claim, not a verdict. Where an adult has
  // since said abandoned or not-done, that wins — otherwise work the guide
  // explicitly rejected kept reading as finished, which is worse than showing
  // nothing at all.
  const ruledOut = doneSlots.length
    ? await prisma.providerCompletion.findMany({
        where: {
          childId,
          slotId: { in: doneSlots.map((s) => s.id) },
          status: { in: ["abandoned", "rejected"] },
        },
        select: { slotId: true },
      })
    : [];
  const ruledOutSlots = new Set(ruledOut.map((c) => c.slotId));
  const doneIds = new Set(
    doneSlots.filter((s) => !ruledOutSlots.has(s.id)).map((s) => s.lessonPlanId)
  );

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
          done: Boolean(l.lessonPlanId && doneIds.has(l.lessonPlanId)),
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
