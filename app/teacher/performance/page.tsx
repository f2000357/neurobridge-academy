import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { todayStr } from "@/lib/time";

export const dynamic = "force-dynamic";

type TopicStat = { topic: string; subject: string; scores: number[]; sessions: number };

function masteryOf(avg: number): { label: string; cls: string } {
  if (avg >= 80) return { label: "Proficient", cls: "good" };
  if (avg >= 50) return { label: "Approaching", cls: "warn" };
  return { label: "Struggling", cls: "crit" };
}

export default async function PerformancePage() {
  const teacher = await prisma.user.findFirst({
    include: { children: { orderBy: { name: "asc" } } },
  });
  if (!teacher) {
    return (
      <main className="page">
        <h1>No guide yet</h1>
      </main>
    );
  }

  const childIds = teacher.children.map((c) => c.id);
  const today = todayStr();

  // Everything recorded, in one pull each.
  const [notes, pointEvents, homework] = await Promise.all([
    prisma.progressNote.findMany({
      where: { score: { not: null }, session: { childId: { in: childIds } } },
      include: { session: { include: { slot: { include: { lessonPlan: true } }, child: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.pointEvent.findMany({ where: { childId: { in: childIds } } }),
    prisma.homework.findMany({
      where: { childId: { in: childIds } },
      select: { childId: true, status: true, score: true },
    }),
  ]);

  // Per child → per topic mastery.
  const topicsByChild = new Map<string, Map<string, TopicStat>>();
  const stuckByChild = new Map<string, string[]>();
  for (const c of teacher.children) {
    topicsByChild.set(c.id, new Map());
    stuckByChild.set(c.id, []);
  }
  for (const n of notes) {
    const childId = n.session.childId;
    const plan = n.session.slot.lessonPlan;
    const topic = plan?.topic || plan?.subject || "General";
    const subject = plan?.subject || "";
    const map = topicsByChild.get(childId);
    if (map) {
      if (!map.has(topic)) map.set(topic, { topic, subject, scores: [], sessions: 0 });
      const stat = map.get(topic)!;
      if (n.score !== null) stat.scores.push(n.score);
      stat.sessions++;
    }
    const stuck = stuckByChild.get(childId);
    if (stuck && n.stuckOn && !/nothing notable/i.test(n.stuckOn) && stuck.length < 3) {
      stuck.push(n.stuckOn);
    }
  }

  // Points + challenge + homework per child.
  const stat = (childId: string) => {
    const evs = pointEvents.filter((e) => e.childId === childId);
    const todayPts = evs.filter((e) => e.date === today).reduce((a, e) => a + e.points, 0);
    const challenges = evs.filter((e) => e.kind === "challenge").length;
    const hw = homework.filter((h) => h.childId === childId);
    return {
      todayPts,
      challenges,
      hwDone: hw.filter((h) => h.status === "completed").length,
      hwAssigned: hw.filter((h) => h.status !== "completed").length,
    };
  };

  // Struggle list across the class.
  const struggles: { child: string; childId: string; topic: string; avg: number }[] = [];
  for (const c of teacher.children) {
    for (const t of topicsByChild.get(c.id)?.values() ?? []) {
      if (t.scores.length === 0) continue;
      const avg = Math.round(t.scores.reduce((a, b) => a + b, 0) / t.scores.length);
      if (avg < 80) struggles.push({ child: c.name, childId: c.id, topic: t.topic, avg });
    }
  }
  struggles.sort((a, b) => a.avg - b.avg);

  const hasAny = notes.length > 0 || pointEvents.length > 0 || homework.length > 0;

  return (
    <main className="page">
      <p className="eyebrow">Results</p>
      <h1>How everyone is doing</h1>
      <p className="muted">
        Everything your children do is recorded here — points, mastery, challenges, homework, and
        where they&apos;re stuck. This is where your 1:1 time earns the most.
      </p>

      {!hasAny && (
        <div className="card" style={{ marginTop: 20 }}>
          <strong>Nothing recorded yet.</strong>{" "}
          <span className="muted">As children finish lessons and homework, results appear here.</span>
        </div>
      )}

      {struggles.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h2>Needs attention</h2>
          <div className="stack">
            {struggles.slice(0, 6).map((s, i) => {
              const m = masteryOf(s.avg);
              return (
                <Link
                  key={i}
                  href={`/teacher/admin/${s.childId}`}
                  className="card row perf-row"
                  style={{ justifyContent: "space-between", color: "inherit" }}
                >
                  <div>
                    <strong>{s.child}</strong> · {s.topic}
                  </div>
                  <span className={`pill ${m.cls}`}>
                    {m.label} · {s.avg}%
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {hasAny && (
        <section style={{ marginTop: 36 }}>
          <h2>Each learner</h2>
          <div className="stack" style={{ gap: 22 }}>
            {teacher.children.map((c) => {
              const s = stat(c.id);
              const topics = Array.from(topicsByChild.get(c.id)?.values() ?? [])
                .filter((t) => t.scores.length > 0)
                .map((t) => ({ ...t, avg: Math.round(t.scores.reduce((a, b) => a + b, 0) / t.scores.length) }))
                .sort((a, b) => a.avg - b.avg);
              const stuck = stuckByChild.get(c.id) ?? [];
              return (
                <div key={c.id} className="card">
                  <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
                    <h2 style={{ margin: 0 }}>{c.name}</h2>
                    <Link href={`/teacher/admin/${c.id}`} className="chip">
                      Set up →
                    </Link>
                  </div>

                  {/* Stat tiles */}
                  <div className="stat-row">
                    <div className="stat-tile">
                      <span className="stat-num">{c.points}</span>
                      <span className="stat-lbl">points ⭐ (lifetime)</span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-num">{s.todayPts}</span>
                      <span className="stat-lbl">points today</span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-num">{s.challenges}</span>
                      <span className="stat-lbl">challenges aced 🌟</span>
                    </div>
                    <div className="stat-tile">
                      <span className="stat-num">
                        {s.hwDone}
                        <span className="muted" style={{ fontSize: "0.9rem" }}>
                          {s.hwAssigned > 0 ? ` / ${s.hwDone + s.hwAssigned}` : ""}
                        </span>
                      </span>
                      <span className="stat-lbl">homework done 📁</span>
                    </div>
                  </div>

                  {/* Topic mastery */}
                  {topics.length > 0 && (
                    <div className="stack" style={{ gap: 8, marginTop: 16 }}>
                      {topics.map((t) => {
                        const m = masteryOf(t.avg);
                        return (
                          <div key={t.topic} className="perf-bar-row">
                            <span className="perf-topic">
                              {t.topic}
                              <span className="muted"> · {t.subject}</span>
                            </span>
                            <span className="perf-track" aria-hidden="true">
                              <span className={`perf-fill ${m.cls}`} style={{ width: `${t.avg}%` }} />
                            </span>
                            <span className={`pill ${m.cls}`}>{t.avg}%</span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Stuck-points */}
                  {stuck.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <p className="stat-lbl" style={{ marginBottom: 6 }}>Where they got stuck</p>
                      <ul className="stuck-list">
                        {stuck.map((st, i) => (
                          <li key={i}>{st}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {topics.length === 0 && stuck.length === 0 && s.hwDone === 0 && (
                    <p className="muted" style={{ margin: "12px 0 0" }}>
                      No finished lessons yet.
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
