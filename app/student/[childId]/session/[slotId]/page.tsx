import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Player, { type Chunk } from "./player";

export const dynamic = "force-dynamic";

export default async function SessionPage({
  params,
}: {
  params: Promise<{ childId: string; slotId: string }>;
}) {
  const { childId: handle, slotId } = await params;

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    include: {
      lessonPlan: true,
      child: { include: { profile: true } },
      sessions: { orderBy: { startedAt: "desc" } },
    },
  });

  // The URL segment is the friendly handle; match it against username or id.
  const matches = slot && (slot.child.username === handle || slot.childId === handle);
  if (!slot || !matches || !slot.lessonPlan) {
    return (
      <main className="page wrap">
        <h1>This lesson isn&apos;t ready</h1>
        <p className="muted">
          <Link href={`/student/${handle}`}>Back to my day</Link>
        </p>
      </main>
    );
  }
  const childId = slot.childId; // real id for data + API
  const linkHandle = slot.child.username ?? slot.childId;

  // Reuse an open run if one exists; otherwise start a new one.
  // A new run after a finished one is a child-chosen relaunch.
  let session = slot.sessions.find((s) => s.state !== "closed");
  if (!session) {
    session = await prisma.session.create({
      data: {
        slotId: slot.id,
        childId,
        origin: slot.sessions.length > 0 ? "relaunch" : "scheduled",
      },
    });
  }

  // "AFTER" for the first/then board: what comes next in the day.
  const nextSlot = await prisma.scheduleSlot.findFirst({
    where: { childId, date: slot.date, startMin: { gte: slot.endMin } },
    include: { lessonPlan: true },
    orderBy: { startMin: "asc" },
  });
  const after = nextSlot
    ? nextSlot.kind === "lesson"
      ? nextSlot.lessonPlan?.title ?? "your next lesson"
      : nextSlot.kind === "break"
        ? "break time"
        : nextSlot.kind === "flexible"
          ? "flexible time"
          : "free time"
    : "you're done for the day";

  const chunks: Chunk[] = JSON.parse(slot.lessonPlan.chunks);

  // Points collected today (all this child's sessions), for the calm running total.
  const todayAgg = await prisma.pointEvent.aggregate({
    where: { childId, date: slot.date },
    _sum: { points: true },
  });

  return (
    <Player
      childId={childId}
      slotId={slot.id}
      dayHref={`/student/${linkHandle}`}
      childName={slot.child.name}
      sessionId={session.id}
      lesson={{
        title: slot.lessonPlan.title,
        goal: slot.lessonPlan.goal,
        why: slot.lessonPlan.whyItMatters,
        durationMin: slot.lessonPlan.durationMin,
        workUrl: slot.lessonPlan.workUrl,
      }}
      chunks={chunks}
      after={after}
      resumeState={session.state}
      resumeData={session.resumeData}
      initialTodayPoints={todayAgg._sum.points ?? 0}
    />
  );
}
