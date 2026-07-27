import { prisma } from "./prisma";

// The learning profile: where this child stands, assembled the day you ask.
//
// Schools report twice a year. This is the same picture, built on demand from
// records the system already holds — working level per subject against the
// standard they're held to, which standards are mastered, IEP goals with their
// status, and how much evidence sits behind it all.
//
// Deliberately NOT an AI call. Every number here is counted from the database,
// so it is reproducible, instant, free, and defensible in a meeting. The only
// AI-derived part is the IEP goal status, which is carried over from a review
// the parent already generated and approved.

export type SubjectStanding = {
  subject: string;
  working: string; // "Grade 1" — where they actually are
  target: string; // "Grade 3" — the standard they're held to
  /** 0-100: how far along the way from the start of school to the target. */
  pct: number;
  atLevel: boolean;
  assessed: boolean;
};

export type GoalStanding = {
  area: string;
  goal: string;
  status: string; // met | on_track | stalled | (whatever the review used)
  evidence: string;
};

export type LearningProfile = {
  childName: string;
  targetGrade: string;
  generatedAt: Date;
  subjects: SubjectStanding[];
  standards: { mastered: number; attempted: number; codes: string[] };
  goals: GoalStanding[];
  goalsFrom: Date | null;
  notes: { count: number; weeks: number; specialists: string[] };
  assessments: { name: string; date: string; score: string }[];
  /** How much history is behind this profile — an empty profile should say so. */
  evidence: { lessons: number; completions: number; firstDay: string | null };
};

/** "K" → 0, "3" → 3, "grade-3" → 3, "" → null. */
export function gradeToNum(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim().toLowerCase().replace(/^grade[-\s]?/, "");
  if (s === "k" || s === "kindergarten") return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function gradeLabel(n: number | null): string {
  if (n === null) return "—";
  return n === 0 ? "Kindergarten" : `Grade ${n}`;
}

/**
 * How far along a child is toward the grade they're held to, as a percentage.
 * Measured from the start of school rather than from zero, so a Grade 2 reader
 * targeting Grade 3 reads as most of the way there — which is the truth, and
 * keeps the bar from implying a child is failing when they are close.
 */
function progressPct(working: number | null, target: number | null): number {
  if (working === null || target === null) return 0;
  if (target <= 0) return 100;
  return Math.max(4, Math.min(100, Math.round((working / target) * 100)));
}

export async function buildLearningProfile(childId: string): Promise<LearningProfile | null> {
  const child = await prisma.child.findUnique({
    where: { id: childId },
    select: { id: true, name: true, gradeLevel: true, profile: true },
  });
  if (!child) return null;

  const target = gradeToNum(child.gradeLevel);

  // ── where they are, per subject ───────────────────────────────────────────
  const subjects: SubjectStanding[] = [
    { key: "Reading", raw: child.profile?.readingLevel ?? "" },
    { key: "Maths", raw: child.profile?.mathLevel ?? "" },
  ].map(({ key, raw }) => {
    const working = gradeToNum(raw);
    return {
      subject: key,
      working: gradeLabel(working),
      target: gradeLabel(target),
      pct: progressPct(working, target),
      atLevel: working !== null && target !== null && working >= target,
      assessed: working !== null,
    };
  });

  // ── standards touched, and which were mastered ────────────────────────────
  // Completions carry the accuracy a guide read off the provider; the standard
  // itself lives on the lesson behind the slot, so we walk completion → slot →
  // lesson. 90% is the same mastery bar the weekly planner uses.
  const completions = await prisma.providerCompletion.findMany({
    where: { childId, status: "validated" },
    select: { slotId: true, accuracy: true },
  });
  const slotIds = completions.map((c) => c.slotId).filter((s): s is string => Boolean(s));
  const slots = slotIds.length
    ? await prisma.scheduleSlot.findMany({
        where: { id: { in: slotIds } },
        select: { id: true, lessonPlan: { select: { standardCode: true } } },
      })
    : [];
  const standardBySlot = new Map(
    slots.map((s) => [s.id, (s.lessonPlan?.standardCode ?? "").trim()])
  );

  const attempted = new Set<string>();
  const mastered = new Set<string>();
  for (const c of completions) {
    const code = c.slotId ? standardBySlot.get(c.slotId) : "";
    if (!code) continue;
    attempted.add(code);
    if ((c.accuracy ?? 0) >= 90) mastered.add(code);
  }

  // ── IEP goals, carried from the most recent review ────────────────────────
  const review = await prisma.iepReview.findFirst({
    where: { childId, archived: false },
    orderBy: { createdAt: "desc" },
    select: { result: true, createdAt: true },
  });
  let goals: GoalStanding[] = [];
  if (review) {
    try {
      const parsed = JSON.parse(review.result) as { goals?: GoalStanding[] };
      goals = (parsed.goals ?? []).map((g) => ({
        area: g.area ?? "",
        goal: g.goal ?? "",
        status: g.status ?? "",
        evidence: g.evidence ?? "",
      }));
    } catch {
      goals = [];
    }
  }

  // ── how much evidence sits behind all of this ─────────────────────────────
  const [noteRows, lessonCount, firstSlot, tests] = await Promise.all([
    prisma.teacherNote.findMany({
      where: { childId },
      select: { date: true, teacher: { select: { name: true } }, authorUser: { select: { name: true } } },
    }),
    prisma.lessonPlan.count({ where: { childId } }),
    prisma.scheduleSlot.findFirst({
      where: { childId },
      orderBy: { date: "asc" },
      select: { date: true },
    }),
    prisma.assessmentPlan.findMany({
      where: { childId, status: "taken" },
      orderBy: { testDate: "desc" },
      select: { testId: true, testDate: true, score: true },
    }),
  ]);

  // Distinct ISO-ish weeks, so "6 weeks of notes" means six different weeks
  // rather than six notes written in one afternoon.
  const weeks = new Set(noteRows.map((n) => isoWeek(n.date)).filter(Boolean));
  const specialists = [
    ...new Set(noteRows.map((n) => n.teacher?.name ?? n.authorUser?.name).filter(Boolean)),
  ] as string[];

  return {
    childName: child.name,
    targetGrade: gradeLabel(target),
    generatedAt: new Date(),
    subjects,
    standards: {
      mastered: mastered.size,
      attempted: attempted.size,
      codes: [...mastered].sort(),
    },
    goals,
    goalsFrom: review?.createdAt ?? null,
    notes: { count: noteRows.length, weeks: weeks.size, specialists },
    assessments: tests.map((t) => ({ name: t.testId, date: t.testDate, score: t.score })),
    evidence: {
      lessons: lessonCount,
      completions: completions.length,
      firstDay: firstSlot?.date ?? null,
    },
  };
}

/** "2026-07-26" → "2026-W30". Empty string for anything unparseable. */
function isoWeek(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return "";
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  // Thursday of the current week decides the year, per ISO 8601.
  t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${week}`;
}
