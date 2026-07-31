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
const GRADE_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export type CoverageNote = {
  score: number | null;
  session: {
    slot: {
      lessonPlan: { subject: string; topic: string; standardCode: string; gradeLevel: string } | null;
    };
  };
};


// Which strand a standard code belongs to.
//
// Coverage is keyed by strand name, and a ProviderCompletion only carries a
// code like "3.OA.B.6". Without this, work done on IXL cannot be matched to a
// strand and the report says "not started" about a child who has mastered eight
// skills — which is what it was doing.
const STRAND_BY_CODE: Record<string, string> = {
  CC: "Counting & Cardinality",
  OA: "Operations & Algebraic Thinking",
  NBT: "Number & Operations in Base Ten",
  NF: "Fractions",
  MD: "Measurement & Data",
  G: "Geometry",
  RP: "Ratios & Proportional Relationships",
  NS: "The Number System",
  EE: "Expressions & Equations",
  SP: "Statistics & Probability",
  F: "Functions",
  RF: "Reading: Foundational Skills",
  RL: "Reading: Literature",
  RI: "Reading: Informational Text",
  W: "Writing: Text Types & Purposes",
  L: "Language: Conventions",
  SL: "Speaking & Listening",
};

export function strandForCode(code: string): string {
  // "3.OA.B.6" -> OA ; "RF.3.4" -> RF
  const parts = (code || "").split(".").filter(Boolean);
  for (const part of parts) {
    const key = part.toUpperCase();
    if (STRAND_BY_CODE[key]) return STRAND_BY_CODE[key];
  }
  return "";
}

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
  // Practice the child actually did on a provider, scored by the guide.
  //
  // Coverage used to read ONLY in-app progress notes. Every one of Prithvi's
  // carries score: null, because his lessons are IXL deep links with no
  // in-app assessment — so the report said "not started" about all 18 areas
  // while he had eight validated skills, and the planner believed he had never
  // begun. Provider work is the evidence; it belongs in here.
  const completions = await prisma.providerCompletion.findMany({
    where: { childId, status: "validated", accuracy: { not: null }, practiceUrl: { not: "" } },
    select: { accuracy: true, practiceUrl: true },
  });
  const items = completions.length
    ? await prisma.contentItem.findMany({
        where: { practiceUrl: { in: completions.map((c) => c.practiceUrl) } },
        select: { practiceUrl: true, subject: true, standardCode: true, gradeLevel: true },
      })
    : [];
  const byUrl = new Map(items.map((i) => [i.practiceUrl, i]));
  const providerNotes: CoverageNote[] = [];
  for (const c of completions) {
    const item = byUrl.get(c.practiceUrl);
    const strand = item ? strandForCode(item.standardCode) : "";
    if (!item || !strand) continue;
    providerNotes.push({
      score: c.accuracy,
      session: {
        slot: {
          lessonPlan: {
            subject: item.subject,
            topic: strand,
            standardCode: item.standardCode,
            gradeLevel: item.gradeLevel,
          },
        },
      },
    });
  }

  const all = [...(notes as CoverageNote[]), ...providerNotes];

  // Where he is WORKING, from evidence rather than from lesson history.
  //
  // It used to be the mode of the grades his lessons carried — which the
  // planner sets, so planning grade-3 lessons kept the working grade at 3 and
  // the working grade kept the planner at grade 3. A closed loop that could
  // never climb however well he did.
  //
  // Now it is the highest grade he has genuinely secured a footing in: at least
  // MASTERY_FOOTING skills mastered there. Master enough of grade 3 and the
  // whole band moves to 4, and the gap to his enrolled grade closes on its own.
  const MASTERY_FOOTING = 3;
  const masteredByGrade = new Map<string, number>();
  for (const n of providerNotes) {
    if ((n.score ?? 0) < 100) continue;
    const g = n.session.slot.lessonPlan!.gradeLevel;
    if (g) masteredByGrade.set(g, (masteredByGrade.get(g) ?? 0) + 1);
  }
  const secured = [...masteredByGrade.entries()]
    .filter(([, n]) => n >= MASTERY_FOOTING)
    .map(([g]) => g)
    .sort((a, b) => GRADE_ORDER.indexOf(a) - GRADE_ORDER.indexOf(b));
  const attempted = mode(
    all.map((n) => n.session.slot.lessonPlan?.gradeLevel ?? "").filter(Boolean) as string[]
  );
  const grade = secured.length ? secured[secured.length - 1] : attempted;

  return {
    grade,
    coverage: coverageFromNotes(all, grade, standards.code),
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
