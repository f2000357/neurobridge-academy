import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminChild, { type ChildForm, type DocMeta, type Proposal } from "./AdminChild";

export const dynamic = "force-dynamic";

export default async function ChildAdminPage({
  params,
}: {
  params: Promise<{ childId: string }>;
}) {
  const { childId } = await params;
  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      profile: true,
      documents: { orderBy: { createdAt: "asc" } },
      proposals: { include: { lessons: true }, orderBy: { createdAt: "desc" }, take: 1 },
      interestBlocks: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!child) {
    return (
      <main className="page">
        <h1>Child not found</h1>
        <p className="muted">
          <Link href="/teacher/admin">Back to setup</Link>
        </p>
      </main>
    );
  }

  const p = child.profile;
  const form: ChildForm = {
    childId: child.id,
    username: child.username ?? "",
    name: child.name,
    age: child.age ?? null,
    interests: p?.interests ?? "",
    notes: p?.iepNotes ?? "",
    accessCode: child.accessCode,
  };
  const documents: DocMeta[] = child.documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    kind: d.kind,
    mimeType: d.mimeType,
  }));
  const latest = child.proposals[0];
  const proposal: Proposal | null = latest
    ? {
        id: latest.id,
        summary: latest.summary,
        lessons: latest.lessons.map((l) => ({
          id: l.id,
          subject: l.subject,
          grade: l.grade,
          topic: l.topic,
          title: l.title,
          rationale: l.rationale,
          status: l.status,
          source: l.source,
          lessonPlanId: l.lessonPlanId,
        })),
      }
    : null;

  const homework = await prisma.homework.findMany({
    where: { childId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    select: { id: true, title: true, dueDate: true, status: true, score: true },
  });

  const interestBlocks = child.interestBlocks.map((i) => ({
    activity: i.activity,
    sessionsPerWeek: i.sessionsPerWeek,
    slotsPerSession: i.slotsPerSession,
    backToBack: i.backToBack,
  }));

  return (
    <AdminChild
      initial={form}
      documents={documents}
      proposal={proposal}
      homework={homework}
      interestBlocks={interestBlocks}
    />
  );
}
