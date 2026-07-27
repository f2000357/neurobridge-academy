import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher, teacherCanSee, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import { activityLabel } from "@/lib/activities";
import { todayStr, addDaysStr } from "@/lib/time";
import TeachConsole, { type BlockRow, type NoteRow } from "./TeachConsole";
import IntroCard from "./IntroCard";

export const dynamic = "force-dynamic";

// A visiting specialist's view of one learner: the child's WHOLE DAY, so the
// therapist has real context — what maths they did, when they had a break, how
// the day ran around their own session — plus the notes the child's specialists
// have written. We deliberately do NOT scope them to "their" blocks: a therapist
// seeing the whole picture is more useful than a tidy boundary, and it means two
// providers covering different parts of the day need no scheduling setup at all.
// Still withheld: documents, evaluations, points.

export default async function TeachChild({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teach");
  if (!(await teacherCanSee(teacher.id, childId))) redirect("/teach");

  const [child, grant, roster] = await Promise.all([
    prisma.child.findUnique({
      where: { id: childId },
      select: {
        id: true,
        name: true,
        age: true,
        // The parent's own introduction — the first thing a therapist should read.
        profile: { select: { aboutMe: true, likes: true, dislikes: true } },
        photo: { select: { updatedAt: true } }, // presence only; bytes come from the image route
      },
    }),
    prisma.teacherAssignment.findUnique({
      where: { teacherId_childId: { teacherId: teacher.id, childId } },
    }),
    teacherRoster(teacher.id),
  ]);
  if (!child) redirect("/teach");

  const today = todayStr();
  const from = addDaysStr(today, -21);

  // The child's whole day, three weeks back up to today — never the future, since
  // a note is written after a session, not before. Not filtered to "their" blocks:
  // the therapist should see how the whole day ran.
  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date: { gte: from, lte: today } },
    include: { lessonPlan: { select: { title: true, subject: true, goal: true, topic: true } } },
    orderBy: [{ date: "desc" }, { startMin: "asc" }],
  });

  const notes = await prisma.teacherNote.findMany({
    where: { childId },
    include: {
      teacher: { select: { id: true, name: true, specialty: true } },
      media: { select: { id: true, kind: true, caption: true, filename: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  const noteBySlot = new Map<string, string>();
  for (const n of notes) if (n.slotId && n.teacherId === teacher.id) noteBySlot.set(n.slotId, n.id);

  // A specialist's authority stops at the activity they govern: they may write a
  // note against their own sessions, and only read the rest of the day.
  const governs = grant?.subject || teacher.specialty;

  const blocks: BlockRow[] = slots.map((s) => ({
    id: s.id,
    date: s.date,
    startMin: s.startMin,
    endMin: s.endMin,
    label:
      activityLabel(s.activity) ??
      (s.lessonPlan ? `${s.lessonPlan.subject} · ${s.lessonPlan.title}` : "Session"),
    lessonTitle: s.lessonPlan?.title ?? "",
    lessonGoal: s.lessonPlan?.goal ?? "",
    lessonTopic: s.lessonPlan?.topic ?? "",
    mine: s.teacherId === teacher.id,
    // Theirs to write up: explicitly assigned to them, or their own activity.
    canNote: s.teacherId === teacher.id || (Boolean(s.activity) && s.activity === governs),
    noteId: noteBySlot.get(s.id) ?? null,
  }));

  const noteRows: NoteRow[] = notes.map((n) => ({
    id: n.id,
    date: n.date,
    slotId: n.slotId,
    authorId: n.teacher.id,
    authorName: n.teacher.name,
    authorSpecialty: n.teacher.specialty,
    subject: n.subject,
    whatWeDid: n.whatWeDid,
    wentWell: n.wentWell,
    struggledWith: n.struggledWith,
    nextTime: n.nextTime,
    focus: n.focus,
    media: n.media,
  }));

  return (
    <main className="page wrap teach-wrap">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <p className="eyebrow">Teacher notes</p>
          <h1>{child.name}</h1>
          <p className="muted" style={{ marginTop: 4 }}>
            You teach {specialtyLabel(grant?.subject || teacher.specialty)}
            {child.age != null ? ` · age ${child.age}` : ""}
          </p>
        </div>
        {roster.length > 1 && (
          <Link className="btn quiet" href="/teach">
            My learners →
          </Link>
        )}
      </div>

      <IntroCard
        childId={child.id}
        childName={child.name}
        hasPhoto={Boolean(child.photo)}
        aboutMe={child.profile?.aboutMe ?? ""}
        likes={child.profile?.likes ?? ""}
        dislikes={child.profile?.dislikes ?? ""}
      />

      <TeachConsole
        childId={child.id}
        childName={child.name}
        teacherId={teacher.id}
        blocks={blocks}
        notes={noteRows}
        today={today}
      />
    </main>
  );
}
