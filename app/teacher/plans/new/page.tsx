import { prisma } from "@/lib/prisma";
import Builder, { type PlanState } from "../Builder";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ childId?: string; subject?: string; grade?: string; topic?: string }>;
}) {
  const teacher = await getCurrentUser({ include: { children: true } });
  if (!teacher) {
    return (
      <main className="page wrap">
        <h1>No teacher yet</h1>
      </main>
    );
  }

  // Prefill when arriving from a child's recommended program.
  const sp = await searchParams;
  const validChild = teacher.children.some((c) => c.id === sp.childId) ? sp.childId! : null;

  const initial: PlanState = {
    title: "",
    subject: sp.subject || "Math",
    gradeLevel: sp.grade || "",
    topic: sp.topic || "",
    standardCode: "",
    standardText: "",
    goal: "",
    whyItMatters: "",
    durationMin: 25,
    childId: validChild,
    published: false,
    visibility: "private",
    chunks: [],
  };

  return (
    <Builder
      initial={initial}
      children={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
