import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminLearners, { type LearnerRow } from "./AdminLearners";

export const dynamic = "force-dynamic";

export default async function AdminLearnersPage() {
  const kids = await prisma.child.findMany({
    where: { archived: false },
    include: { center: { select: { name: true } }, teacher: { select: { name: true } } },
    orderBy: [{ center: { name: "asc" } }, { name: "asc" }],
  });

  const rows: LearnerRow[] = kids.map((c) => ({
    id: c.id,
    name: c.name,
    username: c.username ?? c.id,
    age: c.age ?? null,
    center: c.center?.name ?? "Homeschool",
    guide: c.teacher.name,
    points: c.points - c.pointsSpent,
  }));

  return (
    <div>
      <div className="report-actions no-print" style={{ justifyContent: "flex-start" }}>
        <Link className="btn quiet" href="/admin">
          ← Overview
        </Link>
      </div>
      <p className="eyebrow">Neurable admin</p>
      <h1>Learners</h1>
      <p className="muted">Every learner across all centers. Open any report.</p>
      <AdminLearners rows={rows} />
    </div>
  );
}
