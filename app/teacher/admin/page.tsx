import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AddChild from "./AddChild";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const teacher = await prisma.user.findFirst({
    include: {
      children: {
        include: { documents: true, proposals: { include: { lessons: true } } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!teacher) {
    return (
      <main className="page">
        <h1>No guide yet</h1>
      </main>
    );
  }

  return (
    <main className="page">
      <p className="eyebrow">Setup</p>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <h1>My children</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Add each child, upload their IEP or evaluation, and let the AI propose a program you approve.
          </p>
        </div>
        <AddChild />
      </div>

      <div className="grid2" style={{ marginTop: 20 }}>
        {teacher.children.map((c) => {
          const docCount = c.documents.length;
          const approved = c.proposals.flatMap((p) => p.lessons).filter((l) => l.status === "approved").length;
          const hasProposal = c.proposals.some((p) => p.lessons.length > 0);
          return (
            <Link key={c.id} href={`/teacher/admin/${c.id}`} className="card child-card" style={{ color: "inherit" }}>
              <div>
                <h2 style={{ marginBottom: 4 }}>
                  {c.name}
                  {c.age != null && <span className="muted" style={{ fontWeight: 400 }}> · age {c.age}</span>}
                </h2>
                <div className="row" style={{ gap: 8, marginTop: 6 }}>
                  <span className="muted" style={{ fontSize: "0.85rem" }}>
                    {docCount === 0 ? "No documents yet" : `${docCount} document${docCount === 1 ? "" : "s"}`}
                  </span>
                  {approved > 0 && <span className="pill good">{approved} approved</span>}
                  {hasProposal && approved === 0 && <span className="pill warn">program to review</span>}
                </div>
              </div>
              <span className="btn quiet" style={{ alignSelf: "flex-start" }}>
                Set up →
              </span>
            </Link>
          );
        })}
      </div>
    </main>
  );
}
