import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { coverageFromNotes, mode, type CoverageNote, type SubjectCoverage } from "./coverage";
import { getStandards } from "./standards";
import { withAuthor, noteAuthor } from "./noteAuthor";

export type SubjectReport = {
  subject: string;
  avgScore: number | null;
  level: "emerging" | "approaching" | "proficient" | "—";
  graded: number;
  standardsMastered: string[];
};

export type ChildReport = {
  child: {
    id: string;
    name: string;
    age: number | null;
    grade: string;
    guide: string;
    center: string;
    readingLevel: string;
    mathLevel: string;
    interests: string;
  };
  subjects: SubjectReport[];
  points: { lifetime: number; balance: number };
  homework: { done: number; total: number };
  weeklyTests: { weekStart: string; scores: Record<string, number> }[];
  strengths: string[];
  struggles: string[];
  lessonsCompleted: number;
  generatedAt: string;
  standardsState: string; // "NJ" today; other states later
  coverage: SubjectCoverage[];
  // What the child's visiting specialists wrote — the human half of the record.
  teacherNotes: TeacherNoteSummary[];
};

export type TeacherNoteSummary = {
  date: string;
  teacher: string;
  subject: string;
  whatWeDid: string;
  wentWell: string;
  struggledWith: string;
  nextTime: string;
  focus: number | null;
  mediaCount: number;
  /** The actual photos and clips — a parent came here to see them, not count them. */
  media: { id: string; kind: string; caption: string }[];
};

// Report time window. "term" ≈ the last ~120 days; anything else = all time.
export function sinceForRange(range?: string): Date | undefined {
  if (range === "term") {
    const d = new Date();
    d.setDate(d.getDate() - 120);
    return d;
  }
  return undefined;
}
export const rangeLabel = (range?: string) => (range === "term" ? "the last term (~120 days)" : "all time");

const levelFor = (avg: number | null): SubjectReport["level"] => {
  if (avg == null) return "—";
  if (avg >= 80) return "proficient";
  if (avg >= 50) return "approaching";
  return "emerging";
};

export async function gatherReport(childId: string, since?: Date): Promise<ChildReport | null> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: { profile: true, teacher: { select: { name: true } }, center: { select: { name: true } } },
  });
  if (!child) return null;

  const sinceStr = since ? since.toISOString().slice(0, 10) : null;

  const [notes, closedSessions, homework, weeklyTests] = await Promise.all([
    prisma.progressNote.findMany({
      where: { session: { childId }, ...(since ? { createdAt: { gte: since } } : {}) },
      include: {
        session: {
          include: {
            slot: {
              include: {
                lessonPlan: {
                  select: { subject: true, standardCode: true, gradeLevel: true, topic: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.session.count({ where: { childId, state: "closed", ...(since ? { startedAt: { gte: since } } : {}) } }),
    prisma.homework.findMany({
      where: { childId, ...(since ? { createdAt: { gte: since } } : {}) },
      select: { status: true },
    }),
    prisma.weeklyTest.findMany({
      where: { childId, ...(sinceStr ? { weekStart: { gte: sinceStr } } : {}) },
      orderBy: { weekStart: "asc" },
    }),
  ]);

  // Notes from visiting specialists — the piano teacher, the OT, the tutor.
  const specialistNotes = await prisma.teacherNote.findMany({
    where: { childId, ...(sinceStr ? { date: { gte: sinceStr } } : {}) },
    include: {
      ...withAuthor,
      media: { select: { id: true, kind: true, caption: true } },
      _count: { select: { media: true } },
    },
    orderBy: { date: "desc" },
    take: 40,
  });
  const teacherNotes: TeacherNoteSummary[] = specialistNotes.map((n) => ({
    date: n.date,
    teacher: noteAuthor(n).name,
    subject: n.subject || noteAuthor(n).specialty,
    whatWeDid: n.whatWeDid,
    wentWell: n.wentWell,
    struggledWith: n.struggledWith,
    nextTime: n.nextTime,
    focus: n.focus,
    mediaCount: n._count.media,
    media: n.media.map((m) => ({ id: m.id, kind: m.kind, caption: m.caption })),
  }));

  const bySubject = new Map<string, { scores: number[]; mastered: Set<string> }>();
  const grades: string[] = [];
  const strengths: string[] = [];
  const struggles: string[] = [];
  for (const n of notes) {
    const lp = n.session.slot.lessonPlan;
    const subj = lp?.subject;
    if (lp?.gradeLevel) grades.push(lp.gradeLevel);
    if (subj) {
      const b = bySubject.get(subj) ?? { scores: [], mastered: new Set<string>() };
      if (n.score != null) b.scores.push(n.score);
      if (n.masteryLevel === "proficient" && lp?.standardCode) b.mastered.add(lp.standardCode);
      bySubject.set(subj, b);
    }
    if (n.workedWell?.trim() && strengths.length < 6) strengths.push(n.workedWell.trim());
    if (n.stuckOn?.trim() && struggles.length < 6) struggles.push(n.stuckOn.trim());
  }

  // What this grade is expected to cover, and where the evidence sits.
  const childGrade = mode(grades);
  const standards = getStandards(child.standardsCode);
  const coverage: SubjectCoverage[] = coverageFromNotes(
    notes as unknown as CoverageNote[],
    childGrade,
    standards.code
  );

  const subjects: SubjectReport[] = [...bySubject.entries()].map(([subject, b]) => {
    const avg = b.scores.length ? Math.round(b.scores.reduce((x, y) => x + y, 0) / b.scores.length) : null;
    return { subject, avgScore: avg, level: levelFor(avg), graded: b.scores.length, standardsMastered: [...b.mastered] };
  });
  subjects.sort((a, b) => a.subject.localeCompare(b.subject));

  return {
    child: {
      id: child.id,
      name: child.name,
      age: child.age ?? null,
      grade: childGrade,
      guide: child.teacher.name,
      center: child.center?.name ?? "Homeschool",
      readingLevel: child.profile?.readingLevel ?? "",
      mathLevel: child.profile?.mathLevel ?? "",
      interests: child.profile?.interests ?? "",
    },
    subjects,
    points: { lifetime: child.points, balance: child.points - child.pointsSpent },
    homework: {
      done: homework.filter((h) => h.status === "completed").length,
      total: homework.length,
    },
    weeklyTests: weeklyTests.map((w) => ({
      weekStart: w.weekStart,
      scores: (() => {
        try {
          return JSON.parse(w.scores);
        } catch {
          return {};
        }
      })(),
    })),
    strengths: [...new Set(strengths)],
    struggles: [...new Set(struggles)],
    lessonsCompleted: closedSessions,
    generatedAt: new Date().toISOString(),
    standardsState: standards.label, // e.g. "NJSLS" — swappable per learner
    teacherNotes,
    coverage,
  };
}

// The learner (parent sitting with them) is signed in on this device.
export async function childIsAuthed(childId: string, accessCode: string): Promise<boolean> {
  if (!accessCode) return false;
  const jar = await cookies();
  return jar.get(`nca_${childId}`)?.value === accessCode;
}

// Authorization: who may view/generate a report for this child.
export async function canReport(
  me: { id: string; role: string; centerId: string | null } | null,
  child: { teacherId: string; centerId: string | null }
): Promise<boolean> {
  if (!me) return false;
  if (me.role === "neurable_admin") return true;
  // Centre membership grants access, and does not remove what they hold as a
  // guide — the same person is often both.
  if (me.role === "center_admin" && Boolean(me.centerId) && me.centerId === child.centerId) return true;
  return me.id === child.teacherId;
}
