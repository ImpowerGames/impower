import { describe, expect, test } from "vitest";
import {
  BRACE_CHAPTERS,
  guideExamples,
  isLayoutFragment,
  unwrapFragment,
  wrapFragment,
} from "@impower/sparkdown/src/tests/compiler/guideExamples";
import { formatSource } from "./formatSource";

const CASES = BRACE_CHAPTERS.flatMap(guideExamples).map(
  (e) => [`${e.chapter}:${e.line}`, e.code] as const,
);

describe("formatting the Sparkle guide's examples", () => {
  test("the chapters have examples to format", () => {
    expect(CASES.length).toBeGreaterThan(40);
  });

  test.each(CASES)("%s is unchanged by formatting", (_, code) => {
    if (isLayoutFragment(code)) {
      expect(unwrapFragment(formatSource(wrapFragment(code)))).toBe(code);
    } else {
      expect(formatSource(code)).toBe(code);
    }
  });
});
