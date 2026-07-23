import { subjectKey } from "./subjects";

// One place that decides a schedule block's colour, so every calendar agrees:
// a lesson takes its subject's hue, and each non-lesson kind gets its own —
// a break reads red. Returns a CSS colour usable inline or in color-mix().

const KIND_COLOR: Record<string, string> = {
  break: "var(--slot-break)",
  flexible: "var(--slot-flex)",
  service: "var(--slot-service)",
  testing: "var(--slot-testing)",
  one_on_one: "var(--slot-oneonone)",
  free_time: "var(--slot-free)",
};

export function slotColor(kind: string, subject?: string | null): string {
  if (kind === "lesson") return `var(--subj-${subjectKey(subject)})`;
  return KIND_COLOR[kind] ?? "var(--slot-free)";
}
