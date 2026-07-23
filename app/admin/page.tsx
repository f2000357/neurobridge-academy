import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminSubmissions from "./AdminSubmissions";
import AdminOnboard from "./AdminOnboard";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const [centers, submissions, globalCount, audit] = await Promise.all([
    prisma.center.findMany({
      include: { _count: { select: { users: true, children: true, lessonPlans: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.lessonPlan.findMany({
      where: { submittedForGlobal: true },
      include: { teacher: { select: { name: true } }, center: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.lessonPlan.count({ where: { visibility: "global" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 10 }),
  ]);
  const learnerCount = await prisma.child.count({ where: { archived: false } });

  return (
    <div>
      <p className="eyebrow">NeuroBridge admin</p>
      <h1>Company overview</h1>

      <div className="stat-row" style={{ marginTop: 18 }}>
        <div className="stat-tile">
          <span className="stat-num">{centers.length}</span>
          <span className="stat-lbl">Centers</span>
        </div>
        <Link className="stat-tile" href="/admin/learners" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="stat-num">{learnerCount}</span>
          <span className="stat-lbl">Learners · reports →</span>
        </Link>
        <div className="stat-tile">
          <span className="stat-num">{globalCount}</span>
          <span className="stat-lbl">Global lessons</span>
        </div>
        <div className="stat-tile">
          <span className="stat-num">{submissions.length}</span>
          <span className="stat-lbl">Awaiting review</span>
        </div>
        <Link className="stat-tile" href="/admin/lessons/new" style={{ color: "inherit", textDecoration: "none" }}>
          <span className="stat-num">＋</span>
          <span className="stat-lbl">New global lesson</span>
        </Link>
      </div>

      <h2 style={{ marginTop: 34 }}>Submitted for the global shelf</h2>
      <AdminSubmissions
        items={submissions.map((s) => ({
          id: s.id,
          title: s.title,
          subject: s.subject,
          gradeLevel: s.gradeLevel,
          standardCode: s.standardCode,
          author: s.teacher.name,
          center: s.center?.name ?? "—",
        }))}
      />

      <h2 style={{ marginTop: 34 }}>Centers</h2>
      <div className="roster">
        {centers.map((c) => (
          <div key={c.id} className="roster-row" style={{ gridTemplateColumns: "1fr auto auto auto" }}>
            <span className="roster-name">{c.name}</span>
            <span className="roster-metric tabnum">{c._count.users} staff</span>
            <span className="roster-metric tabnum">{c._count.children} learners</span>
            <span className="roster-metric tabnum">{c._count.lessonPlans} lessons</span>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 34 }}>Set up</h2>
      <AdminOnboard centers={centers.map((c) => ({ id: c.id, name: c.name }))} />

      {audit.length > 0 && (
        <>
          <h2 style={{ marginTop: 34 }}>Recent admin activity</h2>
          <ul className="audit-list">
            {audit.map((a) => (
              <li key={a.id}>
                <span className="audit-action">{a.action.replace(/_/g, " ")}</span>
                <span className="audit-detail">{a.detail}</span>
                <span className="audit-who">
                  {a.actorName} · {new Date(a.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
