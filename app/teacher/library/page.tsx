import { prisma } from "@/lib/prisma";
import LibraryView, { type LibPlan } from "./LibraryView";

export const dynamic = "force-dynamic";

export default async function LibraryPage() {
  const teacher = await prisma.user.findFirst({ include: { children: true } });
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
    forChild: teacher.children.find((c) => c.id === p.childId)?.name ?? null,
  }));

  return <LibraryView plans={libPlans} />;
}
