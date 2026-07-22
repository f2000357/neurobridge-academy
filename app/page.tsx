import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Parent-first entry: Neurable is a homeschool companion the parent signs into.
// Children don't self-log-in — the parent launches a locked session for them.
export default async function Home() {
  const teacher = await prisma.user.findFirst({
    include: { children: { orderBy: { name: "asc" } } },
  });

  return (
    <div className="frontdoor">
      <header className="topbar">
        <div className="wrap bar">
          <div className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            Neurable
          </div>
        </div>
      </header>

      <main className="page wrap" style={{ maxWidth: 620 }}>
        <div className="parent-welcome">
          <p className="eyebrow">Your homeschool AI companion</p>
          <h1>Guide your children&apos;s learning, together with AI.</h1>
          <p className="muted">
            Plan lessons, set each child&apos;s schedule, and watch how they&apos;re doing. The AI
            teaches the daily lessons, calmly and one step at a time — you stay the guide.
          </p>

          {teacher ? (
            <>
              <Link href="/teacher" className="btn big" style={{ marginTop: 20 }}>
                Continue as {teacher.name} →
              </Link>
              <p className="muted" style={{ fontSize: "0.85rem", marginTop: 14 }}>
                {teacher.children.length} child
                {teacher.children.length === 1 ? "" : "ren"} in your school:{" "}
                {teacher.children.map((c) => c.name).join(", ")}
              </p>
            </>
          ) : (
            <div className="card" style={{ marginTop: 20 }}>
              <h2>No school set up yet</h2>
              <p className="muted">
                Run <code>node prisma/seed.mjs</code> to create the sample school.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="fd-teacherbar">
        <div className="wrap">
          <span className="muted" style={{ fontSize: "0.85rem" }}>
            A calm, AI-powered school for neurodiverse learners.
          </span>
        </div>
      </footer>
    </div>
  );
}
