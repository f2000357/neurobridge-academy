import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayStr, planningHorizonEnd, weekdayShort, fmtMin } from "@/lib/time";
import { getCurrentUser } from "@/lib/auth";
import { rosterChildren } from "@/lib/access";
import TodayCalendar from "./TodayCalendar";
import ApprovalRow, { type ApprovalItem } from "./ApprovalRow";
import ValidationList from "./ValidationList";
import LogExtra from "./LogExtra";

export const dynamic = "force-dynamic";

export default async function TeacherDashboard() {
  const teacher = await getCurrentUser({
    include: {
      children: { where: { archived: false }, include: { profile: true } },
    },
  });

  if (!teacher) {
    return (
      <main className="page wrap">
        <h1>No teacher yet</h1>
        <p className="muted">
          Run <code>node prisma/seed.mjs</code> first.
        </p>
      </main>
    );
  }

  const kids = await rosterChildren(teacher);
  const kidIds = kids.map((c) => c.id);
  const date = todayStr();

  // Everything waiting on the guide's yes/no: proposed lessons (from documents
  // or advancement) and AI-drafted weekly plans.
  const [slots, pendingLessons, pendingWeeks, pendingChecks] = await Promise.all([
    prisma.scheduleSlot.findMany({
      where: { date, childId: { in: kidIds } },
      include: { lessonPlan: true, child: true, sessions: true },
      orderBy: { startMin: "asc" },
    }),
    prisma.proposedLesson.findMany({
      where: { status: "pending", proposal: { childId: { in: kidIds } } },
      include: { proposal: { include: { child: { select: { id: true, name: true } } } } },
    }),
    prisma.weeklyPlan.findMany({
      where: { status: "proposed", childId: { in: kidIds } },
      include: { child: { select: { id: true, name: true } }, _count: { select: { lessons: true } } },
      orderBy: { weekStart: "asc" },
    }),
    prisma.providerCompletion.findMany({
      where: { status: "pending", childId: { in: kidIds } },
      include: { child: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  const checkItems = pendingChecks.map((c) => ({
    id: c.id,
    childId: c.childId,
    childName: c.child.name,
    title: c.title,
    provider: c.provider,
    practiceUrl: c.practiceUrl,
  }));

  // Upcoming empty Flex blocks (within the 2-week horizon), per child — the guide
  // can drop a repeat of an unmastered skill into one of these.
  const flexSlots = await prisma.scheduleSlot.findMany({
    where: { childId: { in: kidIds }, kind: "flexible", lessonPlanId: null, date: { gte: date, lte: planningHorizonEnd() } },
    orderBy: [{ date: "asc" }, { startMin: "asc" }],
    select: { id: true, childId: true, date: true, startMin: true },
  });
  const flexByChild: Record<string, { id: string; label: string }[]> = {};
  for (const s of flexSlots) {
    (flexByChild[s.childId] ??= []).push({ id: s.id, label: `${weekdayShort(s.date)} · ${fmtMin(s.startMin)}` });
  }
  // One capped list — weekly plans first, then proposed lessons.
  const approvalItems: ApprovalItem[] = [
    ...pendingWeeks.map((w) => ({
      key: `w-${w.id}`,
      kind: "week" as const,
      href: `/teacher/week-plan?childId=${w.child.id}&weekStart=${w.weekStart}`,
      icon: "🗓",
      title: `${w.child.name}: week of ${w.weekStart}`,
      sub: `${w._count.lessons} lessons proposed`,
      cta: "Review the week →",
    })),
    ...pendingLessons.map((l) => ({
      key: `l-${l.id}`,
      kind: "lesson" as const,
      proposedLessonId: l.id,
      href: `/teacher/admin/${l.proposal.child.id}`,
      icon: l.source === "advancement" ? "⬆" : "📄",
      title: `${l.proposal.child.name}: ${l.title}`,
      sub: `${l.subject}${l.grade ? ` · Grade ${l.grade}` : ""} · ${
        l.source === "advancement" ? "next-level suggestion" : "from documents"
      }`,
      cta: "Review →",
    })),
  ];
  const approvalCount = approvalItems.length;
  const APPROVAL_MAX = 6;

  return (
    <main className="page">
        <div className="parent-hero">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="eyebrow" style={{ color: "var(--accent-ink)", opacity: 0.85 }}>
                Guide portal
              </p>
              <h1 style={{ color: "var(--accent-ink)" }}>Hello, {teacher.name}</h1>
              <p style={{ marginTop: 0, color: "var(--accent-ink)", opacity: 0.92 }}>
                The AI handles today&apos;s lessons. Your time goes where it matters most.
              </p>
            </div>
            <Link href="/teacher/performance" className="btn btn-oncolor">
              Classroom performance →
            </Link>
          </div>
        </div>

        <section style={{ marginTop: 24 }}>
          <h2 style={{ margin: "0 0 12px" }}>
            Needs your approval{approvalCount > 0 ? ` (${approvalCount})` : ""}
          </h2>
          {approvalCount === 0 ? (
            <p className="muted">You&apos;re all caught up. 🎉</p>
          ) : (
            <div className="approvals">
              {approvalItems.slice(0, APPROVAL_MAX).map((it) => (
                <ApprovalRow key={it.key} item={it} />
              ))}
              {approvalCount > APPROVAL_MAX && (
                <Link href="/teacher/admin" className="muted approval-more">
                  + {approvalCount - APPROVAL_MAX} more to review →
                </Link>
              )}
            </div>
          )}
        </section>

        {checkItems.length > 0 && (
          <section style={{ marginTop: 28 }}>
            <h2 style={{ margin: "0 0 4px" }}>Waiting for your check ({checkItems.length})</h2>
            <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
              Open the child&apos;s work, enter the score (or mark it abandoned). Coins = accuracy ÷ 10.
              Below 90% isn&apos;t mastered — drop a repeat into a Flex block.
            </p>
            <ValidationList items={checkItems} flexByChild={flexByChild} />
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <h2 style={{ margin: "0 0 4px" }}>Log extra work</h2>
          <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
            Did a child race ahead to the next skill on their own? Log it here — pick the skill, enter the
            score, and coins follow. A mastered skill won&apos;t be re-assigned next week.
          </p>
          <LogExtra
            childrenList={kids.map((c) => ({ id: c.id, name: c.name }))}
            flexByChild={flexByChild}
          />
        </section>

        <section style={{ marginTop: 28 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Today&apos;s schedule</h2>
            <span className="row">
              <Link href="/teacher/week" className="btn quiet">
                Week view →
              </Link>
              <Link href="/teacher/schedule" className="btn quiet">
                Schedule →
              </Link>
            </span>
          </div>
          <TodayCalendar
            kids={kids.map((c) => ({ id: c.id, name: c.name }))}
            slots={slots.map((s) => ({
              id: s.id,
              childId: s.childId,
              kind: s.kind,
              activity: s.activity,
              startMin: s.startMin,
              endMin: s.endMin,
              lessonPlan: s.lessonPlan ? { title: s.lessonPlan.title, subject: s.lessonPlan.subject } : null,
              done: s.sessions.some((x) => x.state === "closed"),
            }))}
          />
        </section>

        <section style={{ marginTop: 36 }}>
          <h2>My children</h2>
          <div className="grid2">
            {kids.map((child) => (
              <div key={child.id} className="card child-card">
                <div>
                  <h2 style={{ marginBottom: 4 }}>{child.name}</h2>
                  <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
                    Reading: {child.profile?.readingLevel ?? "—"} · Pacing:{" "}
                    {child.profile?.pacing ?? "—"} · Grounding:{" "}
                    {child.profile?.groundingStyle ?? "—"}
                  </p>
                </div>
                <div className="row" style={{ gap: 8 }}>
                  <Link href={`/teacher/week?childId=${child.id}`} className="btn">
                    📅 Schedule
                  </Link>
                  <Link
                    href={`/api/child-access?childId=${child.id}&code=${child.accessCode}&redirect=/student/${child.username ?? child.id}`}
                    className="btn quiet"
                  >
                    ▶ Start day
                  </Link>
                  <Link href={`/report/${child.username ?? child.id}`} className="btn quiet">
                    📊 Report
                  </Link>
                </div>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            Launching a child opens their locked learning space. Getting back here needs your PIN.
          </p>
        </section>
    </main>
  );
}
