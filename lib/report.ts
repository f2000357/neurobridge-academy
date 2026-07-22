import { prisma } from "./prisma";

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
};

const mode = (arr: string[]): string => {
  if (arr.length === 0) return "";
  const c: Record<string, number> = {};
  for (const g of arr) c[g] = (c[g] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
};

const levelFor = (avg: number | null): SubjectReport["level"] => {
  if (avg == null) return "—";
  if (avg >= 80) return "proficient";
  if (avg >= 50) return "approaching";
  return "emerging";
};

export async function gatherReport(childId: string): Promise<ChildReport | null> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    include: { profile: true, teacher: { select: { name: true } }, center: { select: { name: true } } },
  });
  if (!child) return null;

  const [notes, closedSessions, homework, weeklyTests] = await Promise.all([
    prisma.progressNote.findMany({
      where: { session: { childId } },
      include: {
        session: {
          include: { slot: { include: { lessonPlan: { select: { subject: true, standardCode: true, gradeLevel: true } } } } },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.session.count({ where: { childId, state: "closed" } }),
    prisma.homework.findMany({ where: { childId }, select: { status: true } }),
    prisma.weeklyTest.findMany({ where: { childId }, orderBy: { weekStart: "asc" } }),
  ]);

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
      grade: mode(grades),
      guide: child.teacher.name,
      center: child.center.name,
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
  };
}

// Authorization: who may view/generate a report for this child.
export async function canReport(
  me: { id: string; role: string; centerId: string | null } | null,
  child: { teacherId: string; centerId: string }
): Promise<boolean> {
  if (!me) return false;
  if (me.role === "neurable_admin") return true;
  if (me.role === "center_admin") return me.centerId === child.centerId;
  if (me.role === "guide") return me.id === child.teacherId;
  return false;
}
