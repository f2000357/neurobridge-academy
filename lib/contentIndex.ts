import { prisma } from "./prisma";

// Reading the content index: given where the child stands (a standard, or a
// weak skill from an imported report) and which providers they have, return the
// real deep links. Deterministic — never an AI-invented URL.

export type ProviderLinks = {
  provider: string;
  skillName: string;
  standardCode: string;
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
  videoUrl: string;
  practiceUrl: string;
}): ProviderLinks {
  return {
    provider: i.provider,
    skillName: i.skillName,
    standardCode: i.standardCode,
    videoUrl: i.videoUrl,
    practiceUrl: i.practiceUrl,
  };
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
