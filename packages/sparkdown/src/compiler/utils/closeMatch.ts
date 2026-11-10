import { editDistance } from "../typecheck/StringUtils";

export const closeMatchDistance = (name: string): number =>
  Math.min(2, Math.floor(name.length / 3));

export const closeMatch = (
  name: string,
  candidates: Iterable<string>,
): string | undefined => {
  const bound = closeMatchDistance(name);
  const matches = new Set<string>();
  for (const candidate of candidates) {
    if (
      candidate !== name &&
      !candidate.startsWith("$") &&
      editDistance(name, candidate) <= bound
    ) {
      matches.add(candidate);
    }
  }
  return matches.size === 1 ? [...matches][0] : undefined;
};

export interface CloseMatchData {
  closeMatch: { name: string; match: string };
  expect: string;
}

export const closeMatchData = (
  name: string,
  candidates: Iterable<string>,
): CloseMatchData | undefined => {
  const match = closeMatch(name, candidates);
  return match === undefined
    ? undefined
    : { closeMatch: { name, match }, expect: name };
};

export const closeMatchOf = (
  data: unknown,
): { name: string; match: string } | undefined => {
  const found = (data as Partial<CloseMatchData> | undefined)?.closeMatch;
  return typeof found?.name === "string" && typeof found?.match === "string"
    ? { name: found.name, match: found.match }
    : undefined;
};

export const expectedTextOf = (data: unknown): string | undefined => {
  const expected = (data as { expect?: unknown } | null | undefined)?.expect;
  return typeof expected === "string" ? expected : undefined;
};
