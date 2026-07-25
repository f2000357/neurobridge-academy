// The catalog of external assessments a family can register for and take.
//
// The test itself ALWAYS happens on the provider's own site — we never proctor,
// never hold the child's provider login, and never claim to register on anyone's
// behalf. We keep the plan (what they intend to take, when) and the result they
// type back in, so it can inform the weekly plan and the IEP review.
//
// Links are provider home/section pages on purpose: dates, prices and eligibility
// change often, so the guide confirms current details on the provider's own site.

export type AssessmentKind = "growth" | "achievement" | "diagnostic" | "state" | "college";

export type Assessment = {
  id: string;
  name: string;
  provider: string;
  kind: AssessmentKind;
  /** What it actually tells you. */
  measures: string;
  subjects: string[];
  /** Inclusive grade range this is usually offered for. */
  grades: [string, string];
  /** How often it's typically taken. */
  cadence: string;
  /** Rough cost signal — always confirm on the provider's site. */
  cost: string;
  url: string;
  /** True when a score maps onto the profile's MAP RIT fields. */
  feedsRit?: boolean;
  note?: string;
};

const G = (a: string, b: string): [string, string] => [a, b];

export const ASSESSMENTS: Assessment[] = [
  {
    id: "map_growth",
    name: "MAP Growth",
    provider: "NWEA",
    kind: "growth",
    measures:
      "Adaptive test giving a RIT score and percentile per subject, plus growth against the last sitting. The clearest 'where are they now, and are they moving' signal.",
    subjects: ["Math", "Reading", "Language"],
    grades: G("K", "12"),
    cadence: "2–3× a year (fall / winter / spring)",
    cost: "Through a school, co-op, or an authorized remote proctor",
    url: "https://www.nwea.org/map-growth/",
    feedsRit: true,
    note: "Homeschoolers usually sit MAP through an authorized remote-proctor service or a local co-op.",
  },
  {
    id: "ixl_diagnostic",
    name: "Real-Time Diagnostic",
    provider: "IXL",
    kind: "diagnostic",
    measures:
      "Continuous adaptive diagnostic that lands a per-strand grade level. Cheapest way to keep a current picture between big tests.",
    subjects: ["Math", "Language arts"],
    grades: G("K", "12"),
    cadence: "Rolling — a few questions a week",
    cost: "Included with an IXL subscription",
    url: "https://www.ixl.com/diagnostic",
    note: "If you already pay for IXL, start here before buying a test.",
  },
  {
    id: "iowa",
    name: "Iowa Assessments (ITBS)",
    provider: "Seton Testing Services",
    kind: "achievement",
    measures:
      "Nationally normed achievement test with grade-equivalent and percentile scores. Widely accepted where a standardized score is required.",
    subjects: ["Math", "Reading", "Language", "Science"],
    grades: G("K", "12"),
    cadence: "Once a year",
    cost: "Paid — typically modest, per test",
    url: "https://www.setontesting.com/iowa/",
    note: "Commonly used by homeschoolers for annual-assessment requirements.",
  },
  {
    id: "cat",
    name: "California Achievement Test (CAT)",
    provider: "Seton Testing Services",
    kind: "achievement",
    measures: "Shorter nationally normed achievement test; often the simplest annual option.",
    subjects: ["Math", "Reading", "Language"],
    grades: G("2", "12"),
    cadence: "Once a year",
    cost: "Paid — usually the cheapest annual test",
    url: "https://www.setontesting.com/cat/",
  },
  {
    id: "stanford",
    name: "Stanford Achievement Test",
    provider: "Seton Testing Services",
    kind: "achievement",
    measures: "Nationally normed achievement battery; accepted by most states that require testing.",
    subjects: ["Math", "Reading", "Language", "Science"],
    grades: G("K", "12"),
    cadence: "Once a year",
    cost: "Paid — proctored options available",
    url: "https://www.setontesting.com/stanford/",
    note: "BJU Press Testing also offers Stanford if you prefer their proctoring.",
  },
  {
    id: "state_test",
    name: "State assessment (e.g. NJSLA)",
    provider: "Your state department of education",
    kind: "state",
    measures: "The state's own grade-level test. Rules for homeschoolers vary a lot by state.",
    subjects: ["Math", "ELA", "Science"],
    grades: G("3", "12"),
    cadence: "Once a year (spring)",
    cost: "Free where homeschoolers may participate",
    url: "https://www.nj.gov/education/assessment/",
    note: "Check your state's rules — participation isn't open to homeschoolers everywhere.",
  },
  {
    id: "psat_8_9",
    name: "PSAT 8/9",
    provider: "College Board",
    kind: "college",
    measures: "Early college-readiness benchmark in reading, writing and math.",
    subjects: ["Math", "Reading", "Writing"],
    grades: G("8", "9"),
    cadence: "Once a year",
    cost: "Paid — booked through a school",
    url: "https://satsuite.collegeboard.org/psat-8-9",
  },
  {
    id: "act",
    name: "ACT / Pre-ACT",
    provider: "ACT",
    kind: "college",
    measures: "College-entrance test; the Pre-ACT is the practice benchmark.",
    subjects: ["Math", "Reading", "English", "Science"],
    grades: G("9", "12"),
    cadence: "Several dates a year",
    cost: "Paid — fee waivers exist",
    url: "https://www.act.org",
  },
];

export const STATUSES = ["planned", "registered", "taken", "skipped"] as const;
export type AssessmentStatus = (typeof STATUSES)[number];

export const STATUS_LABEL: Record<string, string> = {
  planned: "Planned",
  registered: "Registered",
  taken: "Taken",
  skipped: "Skipped",
};

export const KIND_LABEL: Record<AssessmentKind, string> = {
  growth: "Growth",
  achievement: "Achievement",
  diagnostic: "Diagnostic",
  state: "State",
  college: "College readiness",
};

export function assessmentById(id: string): Assessment | undefined {
  return ASSESSMENTS.find((a) => a.id === id);
}

const ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** The tests that make sense for a child at this grade (all of them if unknown). */
export function assessmentsForGrade(grade: string): Assessment[] {
  const g = ORDER.indexOf(grade);
  if (g < 0) return ASSESSMENTS;
  return ASSESSMENTS.filter((a) => {
    const lo = ORDER.indexOf(a.grades[0]);
    const hi = ORDER.indexOf(a.grades[1]);
    return g >= lo && g <= hi;
  });
}
