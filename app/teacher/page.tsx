import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { fmtMin, todayStr } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TeacherDashboard() {
  const teacher = await prisma.user.findFirst({
    include: {
      children: { include: { profile: true } },
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
          {slots.length === 0 ? (
            <p className="muted">Nothing scheduled today.</p>
          ) : (
            <div className="stack">
              {slots.map((slot) => (
                <div key={slot.id} className="slot">
                  <span className="time">
                    {fmtMin(slot.startMin)} – {fmtMin(slot.endMin)}
                  </span>
                  <span className="name">
                    {slot.child.name} ·{" "}
                    {slot.kind === "lesson"
                      ? slot.lessonPlan?.title ?? "Lesson"
                      : slot.kind === "one_on_one"
                        ? "1:1 with you"
                        : slot.kind === "flexible"
                          ? "Flexible period"
                          : slot.kind === "break"
                            ? "Break / Lunch"
                            : "Free time"}
                  </span>
                  {(slot.kind === "one_on_one" || slot.kind === "flexible") && (
                    <span className="badge next">
                      {slot.kind === "flexible" ? "your 1:1 window" : "1:1"}
                    </span>
                  )}
                  {slot.sessions.some((s) => s.state === "closed") && (
                    <span className="badge now">done</span>
                  )}
                </div>
              ))}
            </div>
          )}
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
                <Link
                  href={`/api/child-access?childId=${child.id}&code=${child.accessCode}&redirect=/student/${child.username ?? child.id}`}
                  className="btn"
                >
                  ▶ Start {child.name}&apos;s day
                </Link>
              </div>
            ))}
          </div>
          <p className="muted" style={{ fontSize: "0.82rem", marginTop: 10 }}>
            Launching a child opens their locked learning space. Getting back here needs your PIN.
          </p>
        </section>

        <section style={{ marginTop: 36 }}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 14 }}>
            <h2 style={{ margin: 0 }}>Lesson plans</h2>
            <span className="row">
              <Link href="/teacher/library" className="btn quiet">
                Browse library →
              </Link>
              <Link href="/teacher/plans/new" className="btn">
                ✦ New lesson
              </Link>
            </span>
          </div>
          <div className="stack">
            {teacher.lessonPlans.map((plan) => {
              const forChild = teacher.children.find((c) => c.id === plan.childId);
              return (
                <Link
                  key={plan.id}
                  href={`/teacher/plans/${plan.id}`}
                  className="card row"
                  style={{ justifyContent: "space-between", color: "inherit" }}
                >
                  <div>
                    <strong>{plan.title}</strong>
                    <div className="muted" style={{ fontSize: "0.9rem" }}>
                      {plan.subject} · {plan.durationMin} min ·{" "}
                      {plan.published ? "published" : "draft"}
                      {forChild ? ` · for ${forChild.name}` : ""}
                    </div>
                  </div>
                  <span className="muted" aria-hidden="true">
                    Edit →
                  </span>
                </Link>
              );
            })}
            {teacher.lessonPlans.length === 0 && (
              <p className="muted">No lesson plans yet.</p>
            )}
          </div>
        </section>
    </main>
  );
}
