import { LUAU_NAME_TOKEN_SOURCE } from "@impower/sparkdown/src/compiler/utils/luauName";

const EXPRESSION = new RegExp(`(?<![A-Za-z0-9_@])(?:${LUAU_NAME_TOKEN_SOURCE})(?:\\.(?:${LUAU_NAME_TOKEN_SOURCE}))*`, "g");

export const evaluatableExpressionRange = (
  text: string,
  character: number,
): { start: number; end: number } | undefined => {
  for (const m of text.matchAll(EXPRESSION)) {
    const start = m.index ?? 0;
    const end = start + m[0].length;
    if (character < start || character > end) {
      continue;
    }
    const next = text.indexOf(".", character);
    return { start, end: next >= 0 && next < end ? next : end };
  }
  return undefined;
};
