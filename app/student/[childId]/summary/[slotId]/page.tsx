import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtMin } from "@/lib/time";
import { subjectLabel } from "@/lib/subjects";

export const dynamic = "force-dynamic";

// A calm, kid-friendly recap of a finished lesson — viewable anytime.
// From here a child can go further in the same subject, or do this one again.
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

  // Redo is always allowed now.
  //
  // It used to be fenced to the lesson's own slot, flexible time or after
  // hours, and that fence was really protecting the points: nothing stopped a
  // repeat from paying out again, so the only defence was refusing to let it
  // happen. That is backwards — it protected the stars by restricting the
  // learning, and told a child who wanted to practise "not now".
  //
  // The points rule moved to where it belongs: a lesson pays its best attempt
  // once (see /api/session, op "complete"), so a repeat can only ever earn the
  // improvement. With no way to farm, there is no reason left to say no.

  // Where to go next, if they want it.
  //
  // Doing a later lesson now completes that real block early, which the plan
  // already understands — a finished session is skipped by regeneration, so
  // nothing needs moving and the week simply arrives lighter.
  //
  // Offered only when it went well. Pushing a child who just struggled straight
  // into more work is the opposite of what this should feel like; for them the
  // prominent option is "do it again", which can now only earn them more.

  // Work a grown-up has sent back. A closed session says he pressed done; a
  // rejected or abandoned check says it did not count. The second is the
  // verdict, so these slots are NOT finished — he should be offered them again
  // rather than marched past them.
  const sentBack = await prisma.providerCompletion.findMany({
    where: { childId, status: { in: ["rejected", "abandoned"] }, slotId: { not: null } },
    select: { slotId: true },
  });
  const sentBackIds = sentBack.map((c) => c.slotId as string);
  const thisOneSentBack = sentBackIds.includes(slot.id);

  // Sent-back work is not a springboard. Whatever the score said, an adult has
  // asked for this one again, so "go further" is the wrong offer — redo is.
  const wentWell =
    !thisOneSentBack && (answers.length === 0 || correct / answers.length >= 0.8);

  // Anything unfinished with real content, from this lesson onward — counting
  // sent-back work as unfinished, which is the whole point of sending it back.
  const laterUnfinished = {
    childId,
    kind: "lesson",
    lessonPlanId: { not: null },
    id: { not: slot.id },
    AND: [
      { OR: [{ sessions: { none: { state: "closed" } } }, { id: { in: sentBackIds } }] },
      {
        OR: [
          { date: { gt: slot.date } },
          { date: slot.date, startMin: { gt: slot.startMin } },
        ],
      },
    ],
  };

  // Going further in the SUBJECT they just did, which is what a child on a roll
  // actually wants. It used to offer only whatever came next on the clock, so
  // finishing maths well pushed you into reading — there was no way to keep
  // climbing in one subject. This looks anywhere ahead in the plan, not only at
  // the block that happens to be next.
  const moreOfSame = wentWell
    ? await prisma.scheduleSlot.findFirst({
        where: { ...laterUnfinished, lessonPlan: { subject: slot.lessonPlan.subject } },
        include: { lessonPlan: { select: { title: true, subject: true } } },
        orderBy: [{ date: "asc" }, { startMin: "asc" }],
      })
    : null;


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
          {thisOneSentBack ? (
            <>
              <h1>Let&apos;s have another go at {slot.lessonPlan.title}</h1>
              <p className="muted" style={{ maxWidth: "38ch", margin: "0 auto" }}>
                Your guide had a look and thought this one deserves another try. Nothing lost — you
                keep the ⭐ you already have.
              </p>
            </>
          ) : (
            <h1>You finished {slot.lessonPlan.title}! 🎉</h1>
          )}

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

          {/* Going further in the same subject leads — that is what "I'm on a
              roll with maths" wants, and it was the option that did not exist. */}
          {moreOfSame && (
            <div className="keep-going">
              <p className="keep-going-eyebrow">Feeling good?</p>
              <p className="keep-going-what">
                The next {subjectLabel(moreOfSame.lessonPlan?.subject || "")} is ready:{" "}
                <strong>{moreOfSame.lessonPlan?.title}</strong>
              </p>
              <Link className="btn big" href={`/student/${linkHandle}/session/${moreOfSame.id}`}>
                More {subjectLabel(moreOfSame.lessonPlan?.subject || "")} →
              </Link>
              <p className="keep-going-fine">
                You&apos;ll earn points for it, and it&apos;s one less thing later.
              </p>
            </div>
          )}


          <Link
            className={`btn ${moreOfSame ? "quiet" : "big"}`}
            href={`/student/${linkHandle}/session/${slot.id}`}
          >
            ↻ Do it again
          </Link>
          {points > 0 && (
            <p className="muted" style={{ maxWidth: "42ch", fontSize: "0.85rem" }}>
              You keep your {points} ⭐ whatever happens. Beat your score and you&apos;ll collect the
              difference.
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
