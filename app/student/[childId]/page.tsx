import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";
import { ensureMondayTestFallback } from "@/lib/testing";
import { subjectIcon, subjectKey, subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/activities";
import KidLock from "./KidLock";
import DayStrip, { type DaySlot } from "./DayStrip";
import CodeGate from "./CodeGate";

export const dynamic = "force-dynamic";

export default async function StudentToday({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  // The URL segment is the friendly handle (username), falling back to the id.
  const { childId: handle } = await params;
  const child = await prisma.child.findFirst({
    where: { OR: [{ username: handle }, { id: handle }] },
    include: { profile: true },
  });

  if (!child || child.archived) {
    return (
      <main className="page wrap">
        <h1>Hmm, we couldn&apos;t find you</h1>
        <p className="muted">
          <Link href="/">Go back to the front door</Link>
        </p>
      </main>
    );
  }
  const childId = child.id; // real id for data + API
  const linkHandle = child.username ?? child.id; // friendly handle for building URLs

  // The child's link is gated by their 8-digit code (remembered per device).
  const jar = await cookies();
  const authed = Boolean(child.accessCode) && jar.get(`nca_${childId}`)?.value === child.accessCode;
  if (!authed) {
    return <CodeGate childId={childId} childName={child.name} />;
  }

  // Carry a missed Friday check-in into Monday morning, if needed.
  await ensureMondayTestFallback(childId);

  // If the guide marked them absent today, it's a rest day.
  const absentToday = await prisma.absence.findUnique({
    where: { childId_date: { childId, date: todayStr() } },
  });
  if (absentToday) {
    return (
      <>
        <header className="topbar kidbar">
          <div className="wrap bar">
            <span className="brand">
              <span className="mark" aria-hidden="true">
                <span></span>
              </span>
              {child.name}&apos;s day
            </span>
            <KidLock />
          </div>
        </header>
        <main className="page wrap" style={{ maxWidth: 520 }}>
          <section className="phase center">
            <p className="eyebrow">Today</p>
            <h1>Rest up, {child.name} 🌱</h1>
            <p className="muted">
              You&apos;re marked absent today. There&apos;s nothing you need to do — take care and we&apos;ll
              see you next time.
            </p>
          </section>
        </main>
      </>
    );
  }

  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date: todayStr() },
    include: { lessonPlan: true, sessions: true },
    orderBy: { startMin: "asc" },
  });

  const homeworkDue = await prisma.homework.count({ where: { childId, status: "assigned" } });

  const isClosed = (s: (typeof slots)[number]) =>
    s.sessions.some((sess) => sess.state === "closed");

  // The child sees the SUBJECT big (so they always know Math vs Reading …), with
  // the day's actual topic as a smaller line underneath.
  function slotInfo(slot: (typeof slots)[number]): { main: string; sub?: string; subj?: string } {
    if (slot.kind === "break") return { main: "🍎 Break time" };
    if (slot.kind === "testing") return { main: "📋 Weekly check-in" };
    if (slot.kind === "one_on_one") return { main: "🧑‍🏫 1:1 time with your guide" };
    if (slot.kind === "flexible")
      return { main: activityLabel(slot.activity) ?? "🎨 Flexible time — finish up, or Art" };
    if (slot.kind === "service")
      return { main: activityLabel(slot.activity) ?? "🧩 Support session" };
    if (slot.kind === "free_time") return { main: "💬 Free time — ask me anything" };
    const subject = slot.lessonPlan?.subject;
    return {
      main: `${subjectIcon(subject)} ${subjectLabel(subject)}`,
      sub: slot.lessonPlan?.title,
      subj: subjectKey(subject),
    };
  }

  // Which block is "Now" is decided on the client, against a live clock — see
  // DayStrip. The server sends the day's shape and what is already finished.
  const daySlots: DaySlot[] = slots.map((slot) => {
    const info = slotInfo(slot);
    return {
      id: slot.id,
      kind: slot.kind,
      startMin: slot.startMin,
      endMin: slot.endMin,
      main: info.main,
      sub: info.sub,
      subj: info.subj,
      closed: isClosed(slot),
    };
  });

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            {child.name}&apos;s day
          </span>
          <KidLock />
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 640 }}>
        <p className="eyebrow">Today</p>
        <h1>Hi {child.name} 👋</h1>
        <p className="muted">
          {slots.length === 0
            ? "Nothing on your list today. Enjoy the quiet!"
            : "Here is your day. One thing at a time."}
        </p>

        <DayStrip slots={daySlots} linkHandle={linkHandle} />

        <Link
          href={`/student/${linkHandle}/homework`}
          className="card lift"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, color: "inherit" }}
        >
          <span>
            <strong>📁 Homework folder</strong>
            <div className="muted" style={{ fontSize: "0.88rem" }}>
              {homeworkDue > 0
                ? `${homeworkDue} to do — due Monday`
                : "Practice from finished skills lives here"}
            </div>
          </span>
          {homeworkDue > 0 && <span className="badge next">{homeworkDue}</span>}
        </Link>

        <Link
          href={`/student/${linkHandle}/prizes`}
          className="card lift"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12, color: "inherit" }}
        >
          <span>
            <strong>🎁 Prize corner</strong>
            <div className="muted" style={{ fontSize: "0.88rem" }}>
              See what your stars can earn
            </div>
          </span>
          <span className="points" aria-label={`${child.points - child.pointsSpent} stars to spend`}>
            ⭐ {child.points - child.pointsSpent}
          </span>
        </Link>

        <p className="grownup-link">
          <Link href={`/report/${linkHandle}`}>📊 Progress report</Link>
          <span className="muted"> — for a grown-up</span>
        </p>

      </main>
    </>
  );
}
