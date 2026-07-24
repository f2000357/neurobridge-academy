import { prisma } from "./prisma";

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

// The provider ids a child can use. Khan is free, so it's always available on
// top of whatever the family subscribed to (stored CSV on Child.providers).
export function childProviders(providersCsv?: string | null): string[] {
  const set = new Set(
    (providersCsv ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
  set.add("khan");
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

/** Order a child's providers, preferring their paid ones (e.g. IXL) over free Khan. */
export function preferredOrder(providers: string[]): string[] {
  return providers.filter((p) => p !== "khan").concat(providers.includes("khan") ? ["khan"] : []);
}

/** A fallback deep link to the provider's subject area when the index has no exact skill. */
export function providerBrowseUrl(provider: string, subjectKey: string, grade: string): string {
  const g = grade || "3";
  if (provider === "ixl") {
    const area = subjectKey === "math" ? "math" : subjectKey === "science" ? "science" : "ela";
    return `https://www.ixl.com/${area}/grade-${g}`;
  }
  return "https://www.khanacademy.org";
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
