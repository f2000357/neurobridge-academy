import Link from "next/link";
import { prisma } from "@/lib/prisma";
import HomeworkFolder, { type HwItem } from "./HomeworkFolder";

export const dynamic = "force-dynamic";

export default async function HomeworkPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId: handle } = await params;
  const child = await prisma.child.findFirst({
    where: { OR: [{ username: handle }, { id: handle }] },
  });
  if (!child) {
    return (
      <main className="page wrap">
        <h1>Not found</h1>
        <p className="muted">
          <Link href="/">Home</Link>
        </p>
      </main>
    );
  }
  const childId = child.id;
  const linkHandle = child.username ?? child.id;

  const homework = await prisma.homework.findMany({
    where: { childId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });

  const items: HwItem[] = homework.map((h) => ({
    id: h.id,
    title: h.title,
    subject: h.subject,
    dueDate: h.dueDate,
    status: h.status,
    score: h.score,
    questions: (() => {
      try {
        return JSON.parse(h.questions);
      } catch {
        return [];
      }
    })(),
  }));

  return (
    <>
      <header className="topbar kidbar">
        <div className="wrap bar">
          <span className="brand">
            <span className="mark" aria-hidden="true">
              <span></span>
            </span>
            {child.name}&apos;s homework
          </span>
        </div>
      </header>
      <HomeworkFolder childId={linkHandle} items={items} />
    </>
  );
}
