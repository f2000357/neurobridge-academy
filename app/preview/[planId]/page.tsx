import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Player, { type Chunk } from "@/app/student/[childId]/session/[slotId]/player";

export const dynamic = "force-dynamic";

// Run any lesson through the player without scheduling it or recording anything.
export default async function PreviewPage({
  params,
}: {
  params: Promise<{ planId: string }>;
}) {
  const { planId } = await params;
  const plan = await prisma.lessonPlan.findUnique({ where: { id: planId } });
  if (!plan) {
    return (
      <main className="page wrap">
        <h1>Lesson not found</h1>
        <p className="muted">
          <Link href="/teacher">Back to console</Link>
        </p>
      </main>
    );
  }

  // Preview as the child it's customized for (if any), else a generic student.
  const child = plan.childId
    ? await prisma.child.findUnique({ where: { id: plan.childId }, select: { name: true } })
    : null;

  let chunks: Chunk[] = [];
  try {
    chunks = JSON.parse(plan.chunks);
  } catch {
    chunks = [];
  }

  return (
    <Player
      preview
      planId={plan.id}
      previewBackHref={`/teacher/plans/${plan.id}`}
      childId={plan.childId ?? ""}
      childName={child?.name ?? "there"}
      sessionId="preview"
      lesson={{
        title: plan.title,
        goal: plan.goal,
        why: plan.whyItMatters,
        durationMin: plan.durationMin,
        workUrl: plan.workUrl,
      }}
      chunks={chunks}
      after="you're all done"
      resumeState="arrived"
    />
  );
}
