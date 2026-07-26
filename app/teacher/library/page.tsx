import { prisma } from "@/lib/prisma";
import LibraryView, { type LibPlan } from "./LibraryView";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const teacher = await getCurrentUser({ include: { children: true } });
  const kids = teacher ? await rosterChildren(teacher) : [];
  if (!teacher) {
    return (
      <main className="page wrap">
        <h1>No teacher yet</h1>
      </main>
    );
  }

  const plans = await prisma.lessonPlan.findMany({
    where: { teacherId: teacher.id },
    orderBy: [{ subject: "asc" }, { title: "asc" }],
  });

  const libPlans: LibPlan[] = plans.map((p) => ({
    id: p.id,
    title: p.title,
    subject: p.subject,
    gradeLevel: p.gradeLevel,
    topic: p.topic,
    standardCode: p.standardCode,
    durationMin: p.durationMin,
    published: p.published,
    visibility: p.visibility,
    submittedForGlobal: p.submittedForGlobal,
    forChild: kids.find((c) => c.id === p.childId)?.name ?? null,
  }));

  return <LibraryView plans={libPlans} />;
}
