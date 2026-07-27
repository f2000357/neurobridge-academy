import * as njsls from "./njsls";

// A pluggable standards framework. NJ (NJSLS) is the only one implemented today,
// but nothing outside this file should mention NJ by name — add a provider here
// and set a learner's `standardsCode` to switch them over.
export type StandardsProvider = {
  code: string; // "NJ"
  label: string; // "NJSLS" — used in headings and prompts
  name: string; // "New Jersey Student Learning Standards"
  grades: string[];
  subjects: string[];
  topicsFor: (subject: string, grade: string) => string[];
  gradeLabel: (grade: string) => string;
  nextGrade: (grade: string) => string;
};

const NJ: StandardsProvider = {
  code: "NJ",
  label: "NJSLS",
  name: "New Jersey Student Learning Standards",
  grades: njsls.GRADES,
  subjects: njsls.SUBJECTS,
  topicsFor: njsls.topicsFor,
  gradeLabel: njsls.gradeLabel,
  nextGrade: njsls.nextGrade,
};

const PROVIDERS: Record<string, StandardsProvider> = { NJ };

export const DEFAULT_STANDARDS = "NJ";

/** Resolve a learner's standards framework, falling back to the default. */
export function getStandards(code?: string | null): StandardsProvider {
  return PROVIDERS[(code ?? "").toUpperCase()] ?? PROVIDERS[DEFAULT_STANDARDS];
}

/** For pickers / settings UI. */
export function listStandards(): StandardsProvider[] {
  return Object.values(PROVIDERS);
}

/**
 * Which framework applies to a family in this state — and whether it is that
 * state's own standards or the closest one we have implemented.
 *
 * Only NJ is implemented today. Rather than silently serving NJSLS to a family
 * in Michigan, this reports `exact: false` so the UI can say so plainly. NJSLS
 * derives from the Common Core, so for the many states whose standards are also
 * Common Core-derived the maths and ELA progressions line up closely — but
 * "closely" is not "exactly", and a parent deserves to know which they have.
 */
export function standardsForState(stateCode: string): {
  provider: StandardsProvider;
  exact: boolean;
} {
  const code = (stateCode ?? "").toUpperCase();
  const provider = PROVIDERS[code];
  if (provider) return { provider, exact: true };
  return { provider: PROVIDERS[DEFAULT_STANDARDS], exact: false };
}

/** Which states we hold first-party standards for. */
export function implementedStates(): string[] {
  return Object.keys(PROVIDERS);
}
