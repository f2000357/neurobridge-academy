import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtMin, nowMin, todayStr } from "@/lib/time";

export const dynamic = "force-dynamic";

// A calm, kid-friendly recap of a finished lesson — viewable anytime.
// "Do it again" is allowed in the lesson's own slot, flexible/free time, or after hours.
export default async function SummaryPage({
  params,
}: {
  params: Promise<{ childId: string; slotId: string }>;
}) {
  const { childId: handle, slotId } = await params;

  const slot = await prisma.scheduleSlot.findUnique({
    where: { id: slotId },
    include: {
      lessonPlan: true,
      child: true,
      sessions: {
        where: { state: "closed" },
        orderBy: { endedAt: "desc" },
        include: { signals: true, progressNote: true },
      },
    },
  });

  const matches = slot && (slot.child.username === handle || slot.childId === handle);
  if (!slot || !matches || !slot.lessonPlan || slot.sessions.length === 0) {
    return (
      <main className="page wrap">
        <h1>Nothing to show yet</h1>
        <p className="muted">
          <Link href={`/student/${handle}`}>← Back to my day</Link>
        </p>
      </main>
    );
  }
  const childId = slot.childId;
  const linkHandle = slot.child.username ?? slot.childId;

  const session = slot.sessions[0];
  const answers = session.signals.filter((s) => s.kind === "answer");
  const correct = answers.filter((s) => JSON.parse(s.payload).correct).length;
  const reflection = session.signals.find((s) => s.kind === "reflection");
  const feeling = reflection ? (JSON.parse(reflection.payload).feeling as string) : null;
  const points = session.pointsEarned;

  // Is redo allowed right now?
  const daySlots = await prisma.scheduleSlot.findMany({
    where: { childId, date: todayStr() },
    select: { id: true, kind: true, startMin: true, endMin: true },
  });
  const now = nowMin();
  const currentSlot = daySlots.find((s) => s.startMin <= now && now < s.endMin);
  const isSameDay = slot.date === todayStr();
  const redoAllowed =
    !isSameDay || // a past day → after hours
    !currentSlot || // between slots / after school
    currentSlot.id === slot.id || // this lesson's own slot
    currentSlot.kind === "flexible" ||
    currentSlot.kind === "free_time";

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            {slot.child.name}&apos;s day
          </span>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 560 }}>
        <section className="phase center">
          <p className="eyebrow">How you did</p>
          <h1>You finished {slot.lessonPlan.title}! 🎉</h1>

          <div className="card lift summary-card">
            {answers.length > 0 && (
              <p className="summary-line">
                You got <strong>{correct} of {answers.length}</strong> questions right.
              </p>
            )}
            {points > 0 && (
              <p className="summary-line">
                You collected <strong>{points} ⭐</strong>.
              </p>
            )}
            {feeling && (
              <p className="summary-line muted">
                You said it felt <strong>{feeling}</strong>.
              </p>
            )}
            <p className="muted" style={{ fontSize: "0.85rem", margin: 0 }}>
              {fmtMin(slot.startMin)} – {fmtMin(slot.endMin)}
            </p>
          </div>

          {redoAllowed ? (
            <Link className="btn big" href={`/student/${linkHandle}/session/${slot.id}`}>
              ↻ Do it again
            </Link>
          ) : (
            <p className="muted" style={{ maxWidth: "40ch" }}>
              You can do this one again during flexible time or after school. Right now, let&apos;s
              stay with what&apos;s on your list. 🌱
            </p>
          )}

          <p className="muted" style={{ marginTop: 12 }}>
            <Link href={`/student/${linkHandle}`}>← Back to my day</Link>
          </p>
        </section>
      </main>
    </>
  );
}
