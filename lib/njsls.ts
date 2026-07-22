// A curated slice of the New Jersey Student Learning Standards (NJSLS) used to
// organize lessons by subject → grade → topic (strand/domain). This is
// representative across K–12, not the full standards list; the AI fills in the
// specific standard code + text when a lesson is generated.

export const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

export const SUBJECTS = [
  "Math",
  "ELA — Reading",
  "ELA — Writing",
  "Science",
  "Social Studies",
  "Life skills",
];

// Grade bands help show grade-appropriate topics.
type Band = { grades: string[]; topics: string[] };

const MATH: Band[] = [
  { grades: ["K"], topics: ["Counting & Cardinality", "Operations & Algebraic Thinking", "Measurement & Data", "Geometry"] },
  { grades: ["1", "2"], topics: ["Operations & Algebraic Thinking", "Number & Operations in Base Ten", "Measurement & Data", "Geometry"] },
  { grades: ["3", "4", "5"], topics: ["Operations & Algebraic Thinking", "Number & Operations in Base Ten", "Fractions", "Measurement & Data", "Geometry"] },
  { grades: ["6", "7"], topics: ["Ratios & Proportional Relationships", "The Number System", "Expressions & Equations", "Geometry", "Statistics & Probability"] },
  { grades: ["8"], topics: ["The Number System", "Expressions & Equations", "Functions", "Geometry", "Statistics & Probability"] },
  { grades: ["9", "10", "11", "12"], topics: ["Number & Quantity", "Algebra", "Functions", "Geometry", "Statistics & Probability"] },
];

const READING: Band[] = [
  { grades: ["K", "1", "2", "3", "4", "5"], topics: ["Reading: Foundational Skills", "Reading: Literature", "Reading: Informational Text"] },
  { grades: ["6", "7", "8", "9", "10", "11", "12"], topics: ["Reading: Literature", "Reading: Informational Text"] },
];

const WRITING: Band[] = [
  { grades: GRADES, topics: ["Writing: Text Types & Purposes", "Writing: Production & Distribution", "Writing: Research", "Language: Conventions", "Language: Vocabulary", "Speaking & Listening"] },
];

const SCIENCE: Band[] = [
  { grades: GRADES, topics: ["Physical Science", "Life Science", "Earth & Space Science", "Engineering Design"] },
];

const SOCIAL: Band[] = [
  { grades: GRADES, topics: ["Civics & Government", "Geography", "Economics", "History"] },
];

const LIFE: Band[] = [
  { grades: GRADES, topics: ["Daily Routines", "Emotional Regulation", "Communication", "Money & Independence", "Safety"] },
];

const BANDS: Record<string, Band[]> = {
  Math: MATH,
  "ELA — Reading": READING,
  "ELA — Writing": WRITING,
  Science: SCIENCE,
  "Social Studies": SOCIAL,
  "Life skills": LIFE,
};

export function topicsFor(subject: string, grade: string): string[] {
  const bands = BANDS[subject];
  if (!bands) return [];
  if (!grade) {
    // No grade chosen: union of all topics for the subject.
    return Array.from(new Set(bands.flatMap((b) => b.topics)));
  }
  const band = bands.find((b) => b.grades.includes(grade));
  return band ? band.topics : Array.from(new Set(bands.flatMap((b) => b.topics)));
}

export function gradeLabel(g: string): string {
  return g === "K" ? "Kindergarten" : `Grade ${g}`;
}

// The next grade up in the NJSLS progression (K→1→…→12, capped at 12).
export function nextGrade(g: string): string {
  const i = GRADES.indexOf(g);
  if (i < 0) return g;
  return GRADES[Math.min(i + 1, GRADES.length - 1)];
}
