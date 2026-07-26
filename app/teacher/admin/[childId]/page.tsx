import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminChild, { type ChildForm, type DocMeta, type Proposal, type LessonRow, type IepReviewData } from "./AdminChild";
import { type PersonRow, type HistoryRow } from "./People";
import { peopleForChild } from "@/lib/access";
import { historyForChild } from "@/lib/audit";
import { can } from "@/lib/authz";
import { getCurrentUser } from "@/lib/auth";

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
      documents: { orderBy: { createdAt: "desc" } },
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
    gradeLevel: child.gradeLevel ?? "",
    interests: p?.interests ?? "",
    notes: p?.iepNotes ?? "",
    accessCode: child.accessCode,
    providers: child.providers,
  };
  const documents: DocMeta[] = child.documents.map((d) => ({
    id: d.id,
    filename: d.filename,
    kind: d.kind,
    mimeType: d.mimeType,
    createdAt: d.createdAt.toISOString(),
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

  // This child's own lessons, newest-first — only the first page; the rest load
  // on request so a big library doesn't dump all at once.
  const LESSONS_PAGE = 10;
  const lessonsTotal = await prisma.lessonPlan.count({ where: { childId } });
  const lessonsRaw = await prisma.lessonPlan.findMany({
    where: { childId },
    orderBy: { updatedAt: "desc" },
    take: LESSONS_PAGE,
    select: { id: true, title: true, subject: true, gradeLevel: true, standardCode: true, published: true },
  });
  const lessons: LessonRow[] = lessonsRaw.map((l) => ({
    id: l.id,
    title: l.title,
    subject: l.subject,
    gradeLevel: l.gradeLevel,
    standardCode: l.standardCode,
    published: l.published,
  }));

  // External tests this family is tracking (newest first).
  const testRows = await prisma.assessmentPlan.findMany({
    where: { childId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: { id: true, testId: true, status: true, testDate: true, score: true, notes: true },
  });

  // Everyone who may manage this learner, plus the child.s own history.
  const people: PersonRow[] = await peopleForChild(childId);
  const history: HistoryRow[] = await historyForChild(childId, 50);
  const canManageAccess = await can(childId, "manage_access");

  // The most recent (non-archived) IEP review + how many count against the cap.
  const me = await getCurrentUser();
  const isAdmin = me?.role === "neurable_admin";
  const reviewsUsed = await prisma.iepReview.count({ where: { childId, archived: false } });
  const latestReview = await prisma.iepReview.findFirst({
    where: { childId, archived: false },
    orderBy: { createdAt: "desc" },
  });
  let iepReview: IepReviewData = null;
  if (latestReview) {
    try {
      const parsed = JSON.parse(latestReview.result);
      iepReview = {
        createdAt: latestReview.createdAt.toISOString(),
        docCount: latestReview.docCount,
        standing: parsed.standing ?? "",
        goals: parsed.goals ?? [],
        goingWell: parsed.goingWell ?? [],
        concerns: parsed.concerns ?? [],
        focus: parsed.focus ?? [],
        asks: parsed.asks ?? [],
      };
    } catch {
      iepReview = null;
    }
  }

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
      lessons={lessons}
      lessonsTotal={lessonsTotal}
      iepReview={iepReview}
      reviewsUsed={reviewsUsed}
      isAdmin={isAdmin}
      people={people}
      history={history}
      canManageAccess={canManageAccess}
      meUserId={me?.id ?? ""}
      tests={testRows}
      interestBlocks={interestBlocks}
    />
  );
}
