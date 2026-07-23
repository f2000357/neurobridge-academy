import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { fmtMin, nowMin, todayStr } from "@/lib/time";
import { ensureMondayTestFallback } from "@/lib/testing";
import { subjectIcon, subjectKey, subjectLabel } from "@/lib/subjects";
import { activityLabel } from "@/lib/activities";
import KidLock from "./KidLock";
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

  const now = nowMin();
  // "Now" = the current or next unfinished slot; the day flows top to bottom.
  const isClosed = (s: (typeof slots)[number]) =>
    s.sessions.some((sess) => sess.state === "closed");
  const nowIdx = slots.findIndex((s) => !isClosed(s) && s.endMin > now);

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

        <div className="strip">
          {slots.map((slot, i) => {
            const isDone =
              isClosed(slot) || (nowIdx === -1 ? slot.endMin <= now : i < nowIdx);
            const isNow = i === nowIdx;
            const isNext = i === nowIdx + 1 && nowIdx !== -1;
            const info = slotInfo(slot);
            return (
              <div
                key={slot.id}
                className={`slot ${isDone ? "done" : ""} ${isNow ? "now" : ""} ${
                  info.subj ? `subj-${info.subj}` : ""
                }`}
              >
                <span className="time">
                  {fmtMin(slot.startMin)} – {fmtMin(slot.endMin)}
                </span>
                <span className="name">
                  <span className="subj">{info.main}</span>
                  {info.sub && <span className="topic">{info.sub}</span>}
                </span>
                {isNow && <span className="badge now">Now</span>}
                {isNext && <span className="badge next">Next</span>}
                {isNow && slot.kind === "lesson" && (
                  <Link href={`/student/${linkHandle}/session/${slot.id}`} className="btn">
                    Start
                  </Link>
                )}
                {isNow && slot.kind === "testing" && (
                  <Link href={`/student/${linkHandle}/test/${slot.id}`} className="btn">
                    Start
                  </Link>
                )}
                {isDone && slot.kind === "lesson" && isClosed(slot) && (
                  <Link href={`/student/${linkHandle}/summary/${slot.id}`} className="chip">
                    See how I did →
                  </Link>
                )}
              </div>
            );
          })}
        </div>

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

        {nowIdx === -1 && slots.length > 0 && (
          <div className="card" style={{ marginTop: 24, background: "var(--warm-soft)", border: "none" }}>
            <strong>All done for today!</strong>{" "}
            <span className="muted">You worked through your whole list. 🎉</span>
          </div>
        )}
      </main>
    </>
  );
}
