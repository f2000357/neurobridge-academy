// What a non-lesson block can actually be. Two families:
//   electives — optional enrichment the guide plants into a flexible period
//   services  — related services (speech, OT…), often IEP-mandated
// Both are stored in ScheduleSlot.activity so the schedule reads plainly.

export type Activity = {
  id: string;
  label: string;
  emoji: string;
  /** Some activities want more than one 30-minute block back to back. */
  blocks?: number;
};

export const ELECTIVES: Activity[] = [
  { id: "xr_movement", label: "Physical activity with XR", emoji: "🥽" },
  { id: "scratch", label: "Game programming / Scratch", emoji: "💻" },
  { id: "experiments", label: "Science experiments", emoji: "🔬" },
  { id: "music", label: "Music", emoji: "🎵" },
  { id: "outdoor", label: "Outdoor games", emoji: "⚽" },
  { id: "library", label: "Trip to the library", emoji: "📚", blocks: 2 },
  { id: "chess", label: "Chess / Carrom", emoji: "♟️" },
];

export const SERVICES: Activity[] = [
  { id: "speech", label: "Speech therapy", emoji: "🗣️" },
  { id: "ot", label: "Occupational therapy (OT)", emoji: "✋" },
  { id: "pt", label: "Physical therapy (PT)", emoji: "🤸" },
  { id: "counseling", label: "Counseling", emoji: "💬" },
  { id: "behavioral", label: "Behavioral / ABA", emoji: "🧩" },
  { id: "social_skills", label: "Social skills group", emoji: "👫" },
];

const ALL = [...ELECTIVES, ...SERVICES];

export function activityFor(id?: string | null): Activity | null {
  if (!id) return null;
  return ALL.find((a) => a.id === id) ?? null;
}

/** "🔬 Science experiments" — or null when the slot has no activity set. */
export function activityLabel(id?: string | null): string | null {
  const a = activityFor(id);
  return a ? `${a.emoji} ${a.label}` : null;
}

/** The catalog a given slot kind can choose from. */
export function optionsForKind(kind: string): Activity[] {
  if (kind === "service") return SERVICES;
  if (kind === "flexible") return ELECTIVES;
  return [];
}
