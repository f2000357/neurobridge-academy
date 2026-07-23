import { prisma } from "./prisma";
import { getStandards } from "./standards";
import { subjectKey } from "./subjects";

// Which grade-level strands the child's state expects, and how they're doing on
// each. "not-started" is the gap a homeschool parent most needs to see — and the
// signal the weekly planner should be closing.
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
  canonical: string;
  strands: StrandCoverage[];
};

// The four subject lanes the app schedules against. `canonical` is the subject
// name the standards provider uses to look up strands for a grade.
export const COVERAGE_SUBJECTS = [
  { label: "Math", canonical: "Math" },
  { label: "ELA — Reading", canonical: "ELA — Reading" },
  { label: "ELA — Writing", canonical: "ELA — Writing" },
  { label: "Science / Social", canonical: "Science" },
];

// The shape we need off a ProgressNote to judge coverage.
export type CoverageNote = {
  score: number | null;
  session: {
    slot: {
      lessonPlan: { subject: string; topic: string; standardCode: string; gradeLevel: string } | null;
    };
  };
};

export function mode(arr: string[]): string {
  if (arr.length === 0) return "";
  const c: Record<string, number> = {};
  for (const g of arr) c[g] = (c[g] ?? 0) + 1;
  return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
}

export function coverageFromNotes(
  notes: CoverageNote[],
  grade: string,
  standardsCode?: string | null
): SubjectCoverage[] {
  const std = getStandards(standardsCode);
  const byStrand = new Map<string, { scores: number[]; lessons: number; standards: Set<string> }>();
  for (const n of notes) {
    const lp = n.session.slot.lessonPlan;
    if (!lp?.subject || !lp.topic) continue;
    const key = `${subjectKey(lp.subject)}::${lp.topic}`;
    const s = byStrand.get(key) ?? { scores: [], lessons: 0, standards: new Set<string>() };
    s.lessons += 1;
    if (n.score != null) s.scores.push(n.score);
    if (lp.standardCode) s.standards.add(lp.standardCode);
    byStrand.set(key, s);
  }

  return COVERAGE_SUBJECTS.map(({ label, canonical }) => ({
    subject: label,
    canonical,
    strands: std.topicsFor(canonical, grade).map((strand): StrandCoverage => {
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
}

// Standalone lookup for planners: a child's grade + coverage, straight from the
// DB, using whichever standards framework that learner follows.
export async function gatherCoverage(
  childId: string
): Promise<{ grade: string; coverage: SubjectCoverage[]; standards: ReturnType<typeof getStandards> }> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { standardsCode: true },
  });
  const standards = getStandards(child?.standardsCode);
  const notes = await prisma.progressNote.findMany({
    where: { session: { childId } },
    select: {
      score: true,
      session: {
        select: {
          slot: {
            select: {
              lessonPlan: {
                select: { subject: true, topic: true, standardCode: true, gradeLevel: true },
              },
            },
          },
        },
      },
    },
  });
  const grade = mode(
    notes.map((n) => n.session.slot.lessonPlan?.gradeLevel ?? "").filter(Boolean) as string[]
  );
  return {
    grade,
    coverage: coverageFromNotes(notes as CoverageNote[], grade, standards.code),
    standards,
  };
}

// A compact per-subject gap summary for prompting a planner.
export function gapSummary(coverage: SubjectCoverage[]) {
  return coverage.map((c) => ({
    subject: c.subject,
    needsWork: c.strands.filter((s) => s.status === "needs-work").map((s) => s.strand),
    notStarted: c.strands.filter((s) => s.status === "not-started").map((s) => s.strand),
    secure: c.strands.filter((s) => s.status === "secure").map((s) => s.strand),
  }));
}
