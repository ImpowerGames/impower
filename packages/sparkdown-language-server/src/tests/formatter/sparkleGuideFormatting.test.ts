import { describe, expect, test } from "vitest";
import {
  BRACE_CHAPTERS,
  guideExamples,
  isLayoutFragment,
  unwrapFragment,
  wrapFragment,
} from "@impower/sparkdown/src/tests/compiler/guideExamples";
import { formatSource } from "./formatSource";

// #1232: every example in the rewritten Sparkle guide chapters is written the
// way the formatter writes it, so an author who copies one and formats it
// sees no change. A fragment of a layout body is formatted inside a layout.

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
