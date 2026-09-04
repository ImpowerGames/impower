// Whitespace an author typed around a `{...}` interpolation is display
// content and reaches the rendered output unchanged.
//
// A block display body (dialogue under a `NAME:` cue, an action block under
// `$:`, a heading, a title) is lowered as a list of segments: each `{...}`
// becomes its own segment and the text around it becomes text segments. Every
// line of a block body carries the indentation that puts it under its cue, and
// that indentation is not display content, so the lowerer strips it. The strip
// applies to a line, so it applies to a text segment's first line only when
// that segment actually begins a source line — a segment that begins mid-line,
// because an interpolation preceded it, opens with the author's own spacing.
//
// Guarded here:
//   1. A space between `{X}` and the next word survives, in dialogue and in
//      an action block.
//   2. The same holds with several interpolations on one line, with a
//      leading interpolation, and with an expression rather than a bare name.
//   3. Runs of spaces survive whole.
//   4. Indentation on a line that follows an interpolation ending the line
//      before is still stripped.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

const render = (source: string): string => {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  // Match the engine: `Game` runs stories with `collapseWhitespace` off
  // (`spark-engine/src/game/core/classes/Game.ts`), because runs of spaces are
  // display content in sparkdown. The bare ink default is on, which would hide
  // what the lowerer emitted behind a runtime rewrite.
  ctx.story.collapseWhitespace = false;
  return runToEnd(ctx.story);
};

describe("whitespace around `{...}` interpolation in display bodies", () => {
  test("a space after an interpolation survives in dialogue", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT} tonight.
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("a space after an interpolation survives in an action block", () => {
    expect(
      render(`const LIMIT = 5

$:
  The limit is {LIMIT} tonight.
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("an interpolation opening the line keeps the space after it", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  {LIMIT} is the limit.
`),
    ).toBe("5 is the limit.\n");
  });

  test("several interpolations on one line each keep their spacing", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  a {LIMIT} b {LIMIT} c
`),
    ).toBe("a 5 b 5 c\n");
  });

  test("a run of spaces after an interpolation survives whole", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT}  tonight.
`),
    ).toBe("The limit is 5  tonight.\n");
  });

  test("an expression interpolation keeps the space after it", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT + 1} tonight.
`),
    ).toBe("The limit is 6 tonight.\n");
  });

  test("a string-valued interpolation keeps the space after it", () => {
    expect(
      render(`const N = "Bo"

ALICE:
  Hello {N} there.
`),
    ).toBe("Hello Bo there.\n");
  });

  test("indentation on the line after a line-ending interpolation is stripped", () => {
    // The second line's leading spaces put it under the cue, so they are not
    // display content — even though the text segment carrying that line begins
    // right after an interpolation. Pinned by comparison against the same
    // script with the interpolation written out as its literal value, which
    // holds whatever the runtime does with line breaks constant and leaves
    // only the indentation question under test.
    const interpolated = render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT}
  and it holds all night.
`);
    const literal = render(`ALICE:
  The limit is 5
  and it holds all night.
`);
    expect(interpolated).toBe(literal);
    expect(interpolated).not.toContain("  and it holds");
  });

  // Controls: cases the fix must leave exactly as they were.

  test("punctuation directly after an interpolation is unaffected", () => {
    expect(
      render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT}, tonight.
`),
    ).toBe("The limit is 5, tonight.\n");
  });

  test("a dialogue line with no interpolation is unaffected", () => {
    expect(
      render(`ALICE:
  The limit is 5 tonight.
`),
    ).toBe("The limit is 5 tonight.\n");
  });

  test("a top-level line with an interpolation is unaffected", () => {
    expect(
      render(`const LIMIT = 5

The limit is {LIMIT} tonight.
`),
    ).toBe("The limit is 5 tonight.\n");
  });
});
