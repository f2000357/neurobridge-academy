import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentTeacher, teacherCanSee, teacherRoster } from "@/lib/teacherAuth";
import { specialtyLabel } from "@/lib/specialists";
import { activityLabel } from "@/lib/activities";
import { todayStr, addDaysStr } from "@/lib/time";
import TeachConsole, { type BlockRow, type NoteRow } from "./TeachConsole";
import IntroCard from "./IntroCard";
import { withAuthor, noteAuthor } from "@/lib/noteAuthor";

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
        // Emergency contact ONLY — never the home address or the doctor. A
        // specialist may need to reach someone mid-session; they have no reason
        // to know where the child lives.
        contact: {
          select: {
            emergencyName: true,
            emergencyRelation: true,
            emergencyPhone: true,
            emergencyAltPhone: true,
            urgentNotes: true,
          },
        },
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
  // Two weeks ahead as well. Notes still only go on sessions that have happened
  // — the server refuses a future date — but a visiting teacher has to be able
  // to see when they are next expected, which is the whole point of a rota.
  const until = addDaysStr(today, 14);

  // The child's whole day, three weeks back and a fortnight forward. Not
  // filtered to "their" blocks: the therapist should see how the whole day ran.
  const slots = await prisma.scheduleSlot.findMany({
    where: { childId, date: { gte: from, lte: until } },
    include: { lessonPlan: { select: { title: true, subject: true, goal: true, topic: true } } },
    orderBy: [{ date: "desc" }, { startMin: "asc" }],
  });

  const notes = await prisma.teacherNote.findMany({
    where: { childId },
    include: {
      ...withAuthor,
      media: { select: { id: true, kind: true, caption: true, filename: true } },
    },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take: 60,
  });

  // Points already awarded for these sessions — so the control reads "10 given"
  // rather than offering to award twice.
  const awards = await prisma.providerCompletion.findMany({
    where: { childId, slotId: { in: slots.map((s) => s.id) } },
    select: { slotId: true, coins: true },
  });
  const coinsBySlot = new Map(awards.map((a) => [a.slotId ?? "", a.coins]));

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
    kind: s.kind,
    subject: s.subject ?? "",
    upcoming: s.date > today,
    lessonTitle: s.lessonPlan?.title ?? "",
    lessonGoal: s.lessonPlan?.goal ?? "",
    lessonTopic: s.lessonPlan?.topic ?? "",
    mine: s.teacherId === teacher.id,
    // Theirs to write up only if the PARENT put them on this block.
    //
    // It used to also match on activity — any music specialist could write on
    // any music block. But a child can have three piano teachers on three
    // different slots, and that rule let each of them write on the others'
    // sessions. The assignment is per block, because that is how the parent
    // actually arranges the week.
    canNote: s.teacherId === teacher.id,
    noteId: noteBySlot.get(s.id) ?? null,
    coins: coinsBySlot.has(s.id) ? (coinsBySlot.get(s.id) as number) : null,
  }));

  const noteRows: NoteRow[] = notes.map((n) => ({
    id: n.id,
    date: n.date,
    slotId: n.slotId,
    authorId: noteAuthor(n).id,
    authorName: noteAuthor(n).name,
    authorSpecialty: noteAuthor(n).specialty,
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
        {/* Always a way back to their own page. With one learner this used to
            be hidden, which sealed them inside that child's record. */}
        <Link className="btn quiet" href="/teach?me=1">
          {roster.length > 1 ? "My learners →" : "My details →"}
        </Link>
      </div>

      <IntroCard
        childId={child.id}
        childName={child.name}
        hasPhoto={Boolean(child.photo)}
        aboutMe={child.profile?.aboutMe ?? ""}
        likes={child.profile?.likes ?? ""}
        dislikes={child.profile?.dislikes ?? ""}
        emergency={
          child.contact?.emergencyName || child.contact?.emergencyPhone
            ? {
                name: child.contact.emergencyName,
                relation: child.contact.emergencyRelation,
                phone: child.contact.emergencyPhone,
                altPhone: child.contact.emergencyAltPhone,
              }
            : null
        }
        urgentNotes={child.contact?.urgentNotes ?? ""}
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
