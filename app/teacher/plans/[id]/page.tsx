import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Builder, { type PlanState, type Chunk } from "../Builder";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function EditPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [teacher, plan] = await Promise.all([
    getCurrentUser({ include: { children: true } }),
    prisma.lessonPlan.findUnique({ where: { id } }),
  ]);

  if (!teacher || !plan) {
    return (
      <main className="page wrap">
        <h1>Lesson not found</h1>
        <p className="muted">
          <Link href="/teacher">Back to console</Link>
        </p>
      </main>
    );
  }

  let chunks: Chunk[] = [];
  try {
    chunks = JSON.parse(plan.chunks);
  } catch {
    chunks = [];
  }

  const initial: PlanState = {
    id: plan.id,
    title: plan.title,
    subject: plan.subject,
    gradeLevel: plan.gradeLevel,
    topic: plan.topic,
    standardCode: plan.standardCode,
    standardText: plan.standardText,
    goal: plan.goal,
    whyItMatters: plan.whyItMatters,
    workUrl: plan.workUrl,
    durationMin: plan.durationMin,
    childId: plan.childId,
    published: plan.published,
    visibility: plan.visibility,
    chunks,
  };

  return (
    <Builder
      initial={initial}
      canGlobal={teacher.role === "neurable_admin"}
      children={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
    />
  );
}
