import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { topicsFor } from "./njsls";
import { subjectKey } from "./subjects";

export type SubjectReport = {
  subject: string;
  avgScore: number | null;
  level: "emerging" | "approaching" | "proficient" | "—";
  graded: number;
  standardsMastered: string[];
};

// Which grade-level strands the child's state expects, and how they're doing on
// each. "not-started" is the gap a homeschool parent most needs to see.
export type StrandStatus = "secure" | "practicing" | "needs-work" | "not-started";
export type StrandCoverage = {
  strand: string;
  status: StrandStatus;
  lessons: number;
  avgScore: number | null;
  standards: string[];
};
export type SubjectCoverage = {
  subject: string;
  strands: StrandCoverage[];
};

// The four subject lanes the app schedules against. `njsls` is the canonical
// subject name used to look up strands for a grade.
const COVERAGE_SUBJECTS = [
  { label: "Math", njsls: "Math" },
  { label: "ELA — Reading", njsls: "ELA — Reading" },
  { label: "ELA — Writing", njsls: "ELA — Writing" },
  { label: "Science / Social", njsls: "Science" },
];

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

  const bySubject = new Map<string, { scores: number[]; mastered: Set<string> }>();
  const grades: string[] = [];
  const strengths: string[] = [];
  const struggles: string[] = [];
  // Evidence per (subject lane + NJSLS strand), for the coverage map.
  const byStrand = new Map<string, { scores: number[]; lessons: number; standards: Set<string> }>();

  for (const n of notes) {
    const lp = n.session.slot.lessonPlan;
    const subj = lp?.subject;
    if (lp?.gradeLevel) grades.push(lp.gradeLevel);
    if (subj) {
      const b = bySubject.get(subj) ?? { scores: [], mastered: new Set<string>() };
      if (n.score != null) b.scores.push(n.score);
      if (n.masteryLevel === "proficient" && lp?.standardCode) b.mastered.add(lp.standardCode);
      bySubject.set(subj, b);

      if (lp?.topic) {
        const key = `${subjectKey(subj)}::${lp.topic}`;
        const s = byStrand.get(key) ?? { scores: [], lessons: 0, standards: new Set<string>() };
        s.lessons += 1;
        if (n.score != null) s.scores.push(n.score);
        if (lp.standardCode) s.standards.add(lp.standardCode);
        byStrand.set(key, s);
      }
    }
    if (n.workedWell?.trim() && strengths.length < 6) strengths.push(n.workedWell.trim());
    if (n.stuckOn?.trim() && struggles.length < 6) struggles.push(n.stuckOn.trim());
  }

  // What this grade is expected to cover, and where the evidence sits.
  const childGrade = mode(grades);
  const coverage: SubjectCoverage[] = COVERAGE_SUBJECTS.map(({ label, njsls }) => ({
    subject: label,
    strands: topicsFor(njsls, childGrade).map((strand): StrandCoverage => {
      const s = byStrand.get(`${subjectKey(label)}::${strand}`);
      if (!s || s.lessons === 0) {
        return { strand, status: "not-started", lessons: 0, avgScore: null, standards: [] };
      }
      const avg = s.scores.length
        ? Math.round(s.scores.reduce((x, y) => x + y, 0) / s.scores.length)
        : null;
      const status: StrandStatus =
        avg == null ? "practicing" : avg >= 80 ? "secure" : avg >= 50 ? "practicing" : "needs-work";
      return { strand, status, lessons: s.lessons, avgScore: avg, standards: [...s.standards] };
    }),
  }));

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
    standardsState: "NJ",
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
  if (me.role === "center_admin") return Boolean(me.centerId) && me.centerId === child.centerId;
  if (me.role === "guide") return me.id === child.teacherId;
  return false;
}
