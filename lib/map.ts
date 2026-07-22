// Approximate NWEA MAP RIT → grade-level mapping.
// RIT is a stable, equal-interval score; these are median RIT values per grade
// (roughly NWEA's spring norms). This is an ESTIMATE to set a starting working
// level — the guide can always override. Numbers are intentionally approximate.

import { topicsFor } from "./njsls";

const GRADES = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

// Median RIT by grade (index 0 = K … 12 = grade 12).
const READING_MEDIANS = [153, 166, 182, 193, 201, 207, 211, 214, 217, 220, 222, 223, 224];
const MATH_MEDIANS = [150, 167, 185, 197, 207, 215, 221, 226, 230, 232, 235, 236, 237];

export type Subject = "reading" | "math" | "language";

function mediansFor(subject: Subject): number[] {
  return subject === "math" ? MATH_MEDIANS : READING_MEDIANS; // language ≈ reading
}

// Nearest grade whose median RIT is closest to the score.
export function ritToGrade(subject: Subject, rit: number): string {
  const medians = mediansFor(subject);
  let best = 0;
  let bestDiff = Infinity;
  for (let i = 0; i < medians.length; i++) {
    const diff = Math.abs(medians[i] - rit);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = i;
    }
  }
  return GRADES[best];
}

export function gradeToLevelString(grade: string): string {
  return grade === "K" ? "early-reader" : `grade-${grade}`;
}

export function gradeLabelShort(grade: string): string {
  return grade === "K" ? "Kindergarten" : `Grade ${grade}`;
}

// Is the child a bit ahead / on / behind their age-expected grade?
export function levelVsAge(grade: string, age: number | null | undefined): string {
  if (age == null) return "";
  const expected = Math.max(0, age - 5); // grade ≈ age − 5 (K at 5)
  const g = grade === "K" ? 0 : Number(grade);
  if (g <= expected - 2) return "well below grade for age";
  if (g < expected) return "a little below grade for age";
  if (g === expected) return "on grade for age";
  if (g >= expected + 2) return "well above grade for age";
  return "a little above grade for age";
}

const SUBJECT_TO_NJSLS: Record<Subject, string> = {
  reading: "ELA — Reading",
  math: "Math",
  language: "ELA — Writing",
};

// The recommended NJSLS strands for a child's working level in a subject.
export function recommendedStrands(subject: Subject, grade: string): string[] {
  return topicsFor(SUBJECT_TO_NJSLS[subject], grade);
}

export function njslsSubject(subject: Subject): string {
  return SUBJECT_TO_NJSLS[subject];
}
