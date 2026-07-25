// Visiting specialists: what they teach, and the code that identifies them.

import { ELECTIVES, SERVICES } from "./activities";

export type Specialty = { id: string; label: string; emoji: string };

const ACADEMIC: Specialty[] = [
  { id: "math", label: "Math", emoji: "🔢" },
  { id: "reading", label: "Reading", emoji: "📖" },
  { id: "writing", label: "Writing", emoji: "✏️" },
  { id: "science", label: "Science", emoji: "🔬" },
];

/**
 * What a specialist can be hired for: an academic subject, an elective, a
 * related service, or misc. The ids match ScheduleSlot.activity where they can,
 * so a chess coach's blocks line up with the child's chess blocks.
 */
export const SPECIALTIES: Specialty[] = [
  ...ACADEMIC,
  ...ELECTIVES.map((e) => ({ id: e.id, label: e.label, emoji: e.emoji })),
  ...SERVICES.map((s) => ({ id: s.id, label: s.label, emoji: s.emoji })),
  { id: "misc", label: "Miscellaneous", emoji: "✨" },
];

export function specialtyFor(id?: string | null): Specialty {
  return SPECIALTIES.find((s) => s.id === id) ?? { id: "misc", label: "Miscellaneous", emoji: "✨" };
}

export function specialtyLabel(id?: string | null): string {
  const s = specialtyFor(id);
  return `${s.emoji} ${s.label}`;
}

/**
 * A specialist's code: "T" + 8 digits. The leading letter is load-bearing —
 * a learner's code is 8 digits with no prefix, so one sign-in box can tell a
 * child from their piano teacher without asking.
 */
export function newTeacherCode(): string {
  return `T${Math.floor(10000000 + Math.random() * 90000000)}`;
}

export function isTeacherCode(code: string): boolean {
  return /^T\d{8}$/i.test(code.trim());
}

/** Never show a code to anyone but NeuroBridge admin. This is what everyone else sees. */
export function maskedCode(): string {
  return "T•••••••• ";
}

/** Mail the code to the teacher, hiding all but the domain: r•••@school.org */
export function maskEmail(email: string): string {
  const [user, domain] = email.split("@");
  if (!domain) return email;
  return `${user.slice(0, 1)}${"•".repeat(Math.max(2, user.length - 1))}@${domain}`;
}
