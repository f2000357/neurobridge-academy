import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher, teacherCanSee, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import { activityLabel } from "@/lib/activities";
import { todayStr, addDaysStr } from "@/lib/time";
import TeachConsole, { type BlockRow, type NoteRow } from "./TeachConsole";

export const dynamic = "force-dynamic";

// A visiting specialist's view of one learner. Deliberately narrow: their
// blocks, the lesson attached to them, and the notes the child's specialists
// have written. No documents, no evaluations, no points, no other subjects.

export default async function TeachChild({ params }: { params: Promise<{ childId: string }> }) {
  const { childId } = await params;
  const teacher = await getCurrentTeacher();
  if (!teacher) redirect("/teach");
  if (!(await teacherCanSee(teacher.id, childId))) redirect("/teach");

  const [child, grant, roster] = await Promise.all([
    prisma.child.findUnique({ where: { id: childId }, select: { id: true, name: true, age: true } }),
    prisma.teacherAssignment.findUnique({
      where: { teacherId_childId: { teacherId: teacher.id, childId } },
    }),
    teacherRoster(teacher.id),
  ]);
  if (!child) redirect("/teach");

  const today = todayStr();
  const from = addDaysStr(today, -21);

  // Blocks this specialist holds, plus any that match what they teach — three
  // weeks back, never the future. You write a note after the class, not before.
  const slots = await prisma.scheduleSlot.findMany({
    where: {
      childId,
      date: { gte: from, lte: today },
      OR: [{ teacherId: teacher.id }, { activity: grant?.subject ?? "" }],
    },
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
