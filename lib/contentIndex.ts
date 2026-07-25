import { prisma } from "./prisma";
import {
  activeProviderIds,
  activeProviders,
  providerById,
  DEFAULT_PROVIDER,
} from "./providers";

// Reading the content index: given where the child stands (a standard, or a
// weak skill from an imported report) and which providers they have, return the
// real deep links. Deterministic — never an AI-invented URL.

export type ProviderLinks = {
  provider: string;
  skillName: string;
  standardCode: string;
  subject: string;
  gradeLevel: string;
  videoUrl: string;
  practiceUrl: string;
};

// The provider ids a child can use (stored as a CSV on Child.providers). IXL is
// the only platform we integrate with today — it's the one with a crawlable,
// standards-aligned catalog, so every lesson resolves to a real skill deep link.
export function childProviders(providersCsv?: string | null): string[] {
  const active = activeProviderIds();
  const set = new Set(
    (providersCsv ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      // Drop anything not currently offered (e.g. legacy "khan" rows), so a child
      // stored against a retired platform still gets real lessons.
      .filter((p) => active.includes(p))
  );
  // Free platforms are always available on top of what the family pays for.
  for (const p of activeProviders()) if (p.free) set.add(p.id);
  if (set.size === 0) set.add(DEFAULT_PROVIDER);
  return [...set];
}

function toLinks(i: {
  provider: string;
  skillName: string;
  standardCode: string;
  subject: string;
  gradeLevel: string;
  videoUrl: string;
  practiceUrl: string;
}): ProviderLinks {
  return {
    provider: i.provider,
    skillName: i.skillName,
    standardCode: i.standardCode,
    subject: i.subject,
    gradeLevel: i.gradeLevel,
    videoUrl: i.videoUrl,
    practiceUrl: i.practiceUrl,
  };
}

const GRADES_ORDER = ["K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

/** The child's grade and the `below` grades under it — the band to close gaps from. */
export function gradeBand(grade: string, below = 2): string[] {
  const i = GRADES_ORDER.indexOf(grade);
  if (i < 0) return [grade];
  return GRADES_ORDER.slice(Math.max(0, i - below), i + 1);
}

/**
 * The grades to plan across when a child is working BELOW their enrolled grade:
 * one grade under where they're working (for scaffolding) up through the target
 * grade. That way the planner can always reach for on-grade standards as soon as
 * the child is ready, instead of being capped at their current level.
 */
export function gradeSpan(workingGrade: string, targetGrade: string, padBelow = 1): string[] {
  const w = GRADES_ORDER.indexOf(workingGrade);
  const t = GRADES_ORDER.indexOf(targetGrade);
  if (w < 0 && t < 0) return [];
  if (w < 0) return gradeBand(targetGrade);
  if (t < 0) return gradeBand(workingGrade);
  const lo = Math.max(0, Math.min(w, t) - padBelow);
  const hi = Math.max(w, t);
  return GRADES_ORDER.slice(lo, hi + 1);
}

/**
 * The REAL standards the index actually has skills for, in a subject + grade
 * band, for the child's providers. The planner picks the week's focus from THIS
 * menu — so the standard it chooses always resolves to a real deep link, never
 * an invented code that falls back to a generic browse page.
 */
export async function availableStandards(opts: {
  subject: string;
  grades: string[];
  framework?: string;
  cap?: number;
}): Promise<{ standardCode: string; gradeLevel: string; skillName: string }[]> {
  if (opts.grades.length === 0) return [];
  // Provider-agnostic on purpose: a standard is the same standard whichever
  // platform the child uses. We deep-link it into their platform at build time.
  const items = await prisma.contentItem.findMany({
    where: {
      framework: opts.framework ?? "NJ",
      subject: opts.subject,
      gradeLevel: { in: opts.grades },
      active: true,
    },
    select: { standardCode: true, gradeLevel: true, skillName: true },
    orderBy: [{ gradeLevel: "asc" }, { standardCode: "asc" }],
  });
  // Distinct by standard code, keeping one sample skill as a hint.
  const seen = new Map<string, { standardCode: string; gradeLevel: string; skillName: string }>();
  for (const it of items) {
    if (!seen.has(it.standardCode)) seen.set(it.standardCode, it);
  }
  const list = [...seen.values()];
  const cap = opts.cap ?? 40;
  if (list.length <= cap) return list;
  // Too many — sample evenly across the band so every grade stays represented.
  const step = list.length / cap;
  return Array.from({ length: cap }, (_, i) => list[Math.floor(i * step)]);
}

/**
 * Rank a family's platforms for picking one to teach on: indexed catalogues
 * first (we can deep-link an exact skill), then by the registry's own rank.
 */
export function preferredOrder(providers: string[]): string[] {
  return [...providers].sort((a, b) => {
    const pa = providerById(a);
    const pb = providerById(b);
    const ia = pa?.indexed ? 0 : 1;
    const ib = pb?.indexed ? 0 : 1;
    if (ia !== ib) return ia - ib;
    return (pa?.rank ?? 99) - (pb?.rank ?? 99);
  });
}

/** A fallback deep link when the index has no exact skill — the provider's own
 *  browse page for that subject and grade, so the child still lands usefully. */
export function providerBrowseUrl(provider: string, subjectKey: string, grade: string): string {
  const p = providerById(provider) ?? providerById(DEFAULT_PROVIDER);
  return p ? p.browse(subjectKey, grade || "3") : "";
}

/** Best deep links for a standard, limited to the providers the child has. */
export async function contentForStandard(opts: {
  standardCode: string;
  providers: string[];
  framework?: string;
}): Promise<ProviderLinks[]> {
  if (!opts.standardCode || opts.providers.length === 0) return [];
  const items = await prisma.contentItem.findMany({
    where: {
      framework: opts.framework ?? "NJ",
      standardCode: opts.standardCode,
      active: true,
      provider: { in: opts.providers },
    },
    // Stable order so the same standard always yields the same "first" skill.
    orderBy: [{ skillCode: "asc" }, { practiceUrl: "asc" }],
  });
  return items.map(toLinks);
}

/**
 * Deep links for a weak skill NAME (as it appears in an imported report), for
 * the child's providers. A loose contains-match — the planner usually has a
 * skill name, not a clean standard code.
 */
export async function contentForSkillName(opts: {
  skill: string;
  providers: string[];
  framework?: string;
}): Promise<ProviderLinks[]> {
  const skill = opts.skill?.trim();
  if (!skill || opts.providers.length === 0) return [];
  const items = await prisma.contentItem.findMany({
    where: {
      framework: opts.framework ?? "NJ",
      active: true,
      provider: { in: opts.providers },
      skillName: { contains: skill, mode: "insensitive" },
    },
    take: 4,
  });
  return items.map(toLinks);
}
