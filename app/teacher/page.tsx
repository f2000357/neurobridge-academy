import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";
import { getCurrentUser } from "@/lib/auth";
import TodayCalendar from "./TodayCalendar";

export const dynamic = "force-dynamic";

export default async function TeacherDashboard() {
  const teacher = await getCurrentUser({
    include: {
      children: { where: { archived: false }, include: { profile: true } },
      lessonPlans: { orderBy: { updatedAt: "desc" } },
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

  const draftCount = teacher.lessonPlans.filter((p) => !p.published).length;

  const date = todayStr();
  const slots = await prisma.scheduleSlot.findMany({
    where: { date, childId: { in: teacher.children.map((c) => c.id) } },
    include: { lessonPlan: true, child: true, sessions: true },
    orderBy: { startMin: "asc" },
  });

  // Advancement suggestions waiting for the guide to approve/reject.
  const advSuggestions = await prisma.proposedLesson.findMany({
    where: {
      source: "advancement",
      status: "pending",
      proposal: { childId: { in: teacher.children.map((c) => c.id) } },
    },
    include: { proposal: { include: { child: true } } },
  });

  return (
    <main className="page">
        <div className="parent-hero">
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <p className="eyebrow" style={{ color: "var(--accent-ink)", opacity: 0.85 }}>
                Guide portal
              </p>
              <h1 style={{ color: "var(--accent-ink)" }}>Good day, {teacher.name}</h1>
              <p style={{ marginTop: 0, color: "var(--accent-ink)", opacity: 0.92 }}>
                The AI handles today&apos;s lessons. Your time goes where it matters most.
              </p>
            </div>
            <Link href="/teacher/performance" className="btn btn-oncolor">
              Classroom performance →
            </Link>
          </div>
        </div>

        {advSuggestions.length > 0 && (
          <section className="action-banner" style={{ marginTop: 20 }}>
            <div>
              <strong>⬆ {advSuggestions.length} next-level suggestion{advSuggestions.length === 1 ? "" : "s"} to review</strong>
              <div className="muted" style={{ fontSize: "0.88rem" }}>
                Based on skills your children just mastered.{" "}
                {advSuggestions.map((s, i) => (
                  <span key={s.id}>
                    {i > 0 ? " · " : ""}
                    <Link href={`/teacher/admin/${s.proposal.childId}`}>
                      {s.proposal.child.name}: {s.title}
                    </Link>
                  </span>
                ))}
              </div>
            </div>
          </section>
        )}

        <section style={{ marginTop: 28 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Today&apos;s schedule</h2>
            <span className="row">
              <Link href="/teacher/week" className="btn quiet">
                Week view →
              </Link>
              <Link href="/teacher/schedule" className="btn quiet">
                Plan a day →
              </Link>
            </span>
          </div>
          <TodayCalendar
            kids={teacher.children.map((c) => ({ id: c.id, name: c.name }))}
            slots={slots.map((s) => ({
              id: s.id,
              childId: s.childId,
              kind: s.kind,
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
            {teacher.children.map((child) => (
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
                  <Link
                    href={`/api/child-access?childId=${child.id}&code=${child.accessCode}&redirect=/student/${child.username ?? child.id}`}
                    className="btn"
                  >
                    ▶ Start {child.name}&apos;s day
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

        <section style={{ marginTop: 36 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Lessons</h2>
            <span className="row">
              <Link href="/teacher/library" className="btn quiet">
                Browse all {teacher.lessonPlans.length > 0 ? `(${teacher.lessonPlans.length})` : ""} →
              </Link>
              <Link href="/teacher/plans/new" className="btn">
                ✦ New lesson
              </Link>
            </span>
          </div>

          {teacher.lessonPlans.length === 0 ? (
            <p className="muted">No lessons yet — start with “New lesson”.</p>
          ) : (
            <>
              {draftCount > 0 && (
                <Link href="/teacher/library" className="lesson-drafts">
                  ✎ {draftCount} draft{draftCount === 1 ? "" : "s"} to finish
                </Link>
              )}
              <p className="eyebrow" style={{ marginTop: draftCount > 0 ? 16 : 0 }}>
                Recently edited
              </p>
              <div className="lesson-recent">
                {teacher.lessonPlans.slice(0, 4).map((plan) => {
                  const forChild = teacher.children.find((c) => c.id === plan.childId);
                  return (
                    <Link key={plan.id} href={`/teacher/plans/${plan.id}`} className="lesson-chip">
                      <strong>{plan.title}</strong>
                      <span className="muted">
                        {plan.subject}
                        {!plan.published ? " · draft" : ""}
                        {forChild ? ` · ${forChild.name}` : ""}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </section>
    </main>
  );
}
