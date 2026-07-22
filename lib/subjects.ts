// Map a lesson's stored subject ("ELA — Reading", "Science / Social", …) to a
// short, friendly name the child recognizes, plus an icon and a color key.

export function subjectKey(subject?: string | null): string {
  const s = (subject ?? "").toLowerCase();
  if (s.includes("math")) return "math";
  if (s.includes("read")) return "reading";
  if (s.includes("writ")) return "writing";
  if (s.includes("science") || s.includes("social")) return "science";
  return "other";
}

const LABELS: Record<string, string> = {
  math: "Math",
  reading: "Reading",
  writing: "Writing",
  science: "Science",
};

export function subjectLabel(subject?: string | null): string {
  const k = subjectKey(subject);
  if (k === "other") return subject?.trim() || "Lesson";
  return LABELS[k];
}

const ICONS: Record<string, string> = {
  math: "🔢",
  reading: "📖",
  writing: "✏️",
  science: "🔬",
  other: "📘",
};

export function subjectIcon(subject?: string | null): string {
  return ICONS[subjectKey(subject)];
}
