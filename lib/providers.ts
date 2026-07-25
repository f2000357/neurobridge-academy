// The catalog of practice platforms we can send a child to.
//
// A family declares which subscriptions they hold (Child.providers, a CSV of
// ids). When a lesson is built we look up the chosen standard in the content
// index and pick the best platform the family ACTUALLY has — so the same plan
// works whether they pay for IXL, MobyMax, both, or neither.
//
// ── Adding a provider ────────────────────────────────────────────────────────
//  1. Add an entry here (id, name, how to browse it, which lanes it covers).
//  2. Give it a harvester that fills ContentItem rows with `provider: <id>`
//     (see prisma/crawl-index.mjs for the IXL one) — until then set
//     `indexed: false` and lessons fall back to its browse URL.
//  3. Nothing else. The profile picker, lesson builder, validation list and the
//     planner all read from this list.

export type Provider = {
  id: string;
  name: string;
  /** One line the parent sees when choosing subscriptions. */
  blurb: string;
  /** Free platforms can be offered even when the family subscribes to nothing. */
  free: boolean;
  /** True once its catalog is in the content index, so we can deep-link skills. */
  indexed: boolean;
  /** Lower sorts first when a family has several and more than one has the skill. */
  rank: number;
  /** Our subject lanes this platform covers. */
  subjects: string[];
  /** Where to send a child when the index has no exact skill for them. */
  browse: (subjectKey: string, grade: string) => string;
  /** Hidden from pickers when false (retired, or not built yet). */
  active: boolean;
};

export const PROVIDERS: Provider[] = [
  {
    id: "ixl",
    name: "IXL",
    blurb: "Standards-aligned skills with a video and practice for each. Subscription.",
    free: false,
    indexed: true,
    rank: 10,
    subjects: ["math", "reading", "writing", "science"],
    browse: (subjectKey, grade) => {
      const area = subjectKey === "math" ? "math" : subjectKey === "science" ? "science" : "ela";
      return `https://www.ixl.com/${area}/grade-${grade || "3"}`;
    },
    active: true,
  },
  // Example of the shape a second platform takes. Flip `active` on once its
  // catalog is indexed (or leave indexed:false to use the browse fallback).
  // {
  //   id: "mobymax",
  //   name: "MobyMax",
  //   blurb: "Adaptive practice across subjects, with placement tests. Subscription.",
  //   free: false, indexed: false, rank: 20,
  //   subjects: ["math", "reading", "writing", "science"],
  //   browse: () => "https://www.mobymax.com",
  //   active: false,
  // },
];

/** The default when a family has told us nothing. */
export const DEFAULT_PROVIDER = "ixl";

export const activeProviders = (): Provider[] => PROVIDERS.filter((p) => p.active);
export const activeProviderIds = (): string[] => activeProviders().map((p) => p.id);

export function providerById(id: string): Provider | undefined {
  return PROVIDERS.find((p) => p.id === id);
}

/** Display name for a provider id, falling back to the raw id. */
export function providerName(id?: string | null): string {
  if (!id) return "the provider";
  return providerById(id)?.name ?? id;
}

/** Providers that cover a subject lane, best-ranked first. */
export function providersForSubject(subjectKey: string, ids: string[]): string[] {
  return ids
    .map(providerById)
    .filter((p): p is Provider => Boolean(p) && p!.subjects.includes(subjectKey))
    .sort((a, b) => a.rank - b.rank)
    .map((p) => p.id);
}
