import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AdminChild, { type ChildForm, type DocMeta, type Proposal, type LessonRow, type IepReviewData } from "./AdminChild";
import { type PersonRow, type HistoryRow } from "./People";
import { peopleForChild } from "@/lib/access";
import { historyForChild } from "@/lib/audit";
import { can, canEditIntro } from "@/lib/authz";
import { type IntroData, type ContactData, EMPTY_CONTACT } from "./Profile";
import { type ProfileData } from "./LearningProfile";
import { type CentreState } from "./CentreCard";
import { buildLearningProfile } from "@/lib/learningProfile";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function ChildAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ childId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { childId } = await params;
  const { tab } = await searchParams;
  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: {
      profile: true,
      documents: { orderBy: { createdAt: "desc" } },
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
    stateCode: child.stateCode ?? "",
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

  const homework = await prisma.homework.findMany({
    where: { childId },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    select: { id: true, title: true, dueDate: true, status: true, score: true },
  });


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

  // The parent's introduction. `select` deliberately omits ChildPhoto.data —
  // we only need to know whether a picture exists, not carry its bytes.
  const photo = await prisma.childPhoto.findUnique({
    where: { childId },
    select: { updatedAt: true },
  });
  const canEditProfile = await canEditIntro(childId);
  // Address / emergency / doctor: its own table, loaded only on this screen.
  const contactRow = await prisma.childContact.findUnique({ where: { childId } });
  const contact: ContactData = contactRow
    ? {
        addressLine1: contactRow.addressLine1, addressLine2: contactRow.addressLine2,
        city: contactRow.city, region: contactRow.region, postalCode: contactRow.postalCode,
        emergencyName: contactRow.emergencyName, emergencyRelation: contactRow.emergencyRelation,
        emergencyPhone: contactRow.emergencyPhone, emergencyAltPhone: contactRow.emergencyAltPhone,
        doctorName: contactRow.doctorName, doctorPractice: contactRow.doctorPractice,
        doctorPhone: contactRow.doctorPhone, urgentNotes: contactRow.urgentNotes,
      }
    : EMPTY_CONTACT;
  const primary = people.find((x) => x.role === "primary_guide");
  const intro: IntroData = {
    childId: child.id,
    childName: child.name,
    aboutMe: p?.aboutMe ?? "",
    likes: p?.likes ?? "",
    dislikes: p?.dislikes ?? "",
    hasPhoto: Boolean(photo),
    updatedAt: p?.introUpdatedAt
      ? p.introUpdatedAt.toLocaleDateString(undefined, { dateStyle: "medium" })
      : null,
  };

  // The learning profile is counted from the database on every load — no AI
  // call, so there is nothing to cache and nothing to wait for.
  const built = await buildLearningProfile(childId);
  const learningProfile: ProfileData | null = built && {
    ...built,
    generatedAt: built.generatedAt.toLocaleDateString(undefined, { dateStyle: "medium" }),
    goalsFrom: built.goalsFrom ? built.goalsFrom.toISOString() : null,
  };

  // The family's relationship with a centre. Membership lives on Child.centerId;
  // the request rows are only the asking.
  const [centreRow, pendingReq, lastDecided, centreOptions] = await Promise.all([
    child.centerId
      ? prisma.center.findUnique({ where: { id: child.centerId }, select: { id: true, name: true, region: true } })
      : Promise.resolve(null),
    prisma.centerJoinRequest.findFirst({
      where: { childId, status: "pending" },
      include: { center: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.centerJoinRequest.findFirst({
      where: { childId, status: { in: ["approved", "declined"] } },
      include: { center: { select: { name: true } } },
      orderBy: { decidedAt: "desc" },
    }),
    prisma.center.findMany({ select: { id: true, name: true, region: true }, orderBy: { name: "asc" } }),
  ]);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { dateStyle: "medium" });
  const centre: CentreState = {
    childId: child.id,
    childName: child.name,
    member: centreRow,
    pending: pendingReq
      ? { id: pendingReq.id, centerName: pendingReq.center.name, createdAt: fmt(pendingReq.createdAt) }
      : null,
    lastDecision: lastDecided
      ? {
          status: lastDecided.status,
          centerName: lastDecided.center.name,
          note: lastDecided.decidedNote,
          decidedAt: lastDecided.decidedAt ? fmt(lastDecided.decidedAt) : "",
        }
      : null,
    options: centreOptions,
    canAct: canEditProfile, // the primary guardian, same gate as the profile
    primaryGuideName: primary?.name ?? null,
  };

  const interestBlocks = child.interestBlocks.map((i) => ({
    activity: i.activity,
    sessionsPerWeek: i.sessionsPerWeek,
    slotsPerSession: i.slotsPerSession,
    backToBack: i.backToBack,
  }));

  return (
    <AdminChild
      initialTab={tab}
      initial={form}
      documents={documents}
      homework={homework}
      iepReview={iepReview}
      reviewsUsed={reviewsUsed}
      isAdmin={isAdmin}
      people={people}
      history={history}
      canManageAccess={canManageAccess}
      meUserId={me?.id ?? ""}
      tests={testRows}
      interestBlocks={interestBlocks}
      intro={intro}
      canEditProfile={canEditProfile}
      primaryGuideName={primary?.name ?? null}
      learningProfile={learningProfile}
      contact={contact}
      centre={centre}
    />
  );
}
