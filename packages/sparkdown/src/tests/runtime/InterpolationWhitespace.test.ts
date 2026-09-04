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
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
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

  test("a segment spanning two lines keeps line one's spacing and strips line two's indent", () => {
    // One text segment carries both halves: it begins mid-line after the
    // interpolation (so its first line opens with the author's space, which
    // survives) and continues onto the next source line (whose leading spaces
    // put it under the cue, so they are stripped). Both halves are under test
    // in one assertion.
    //
    // Pinned by comparison against the same script with the interpolation
    // written out as its literal value. That holds constant whatever the
    // runtime does with line breaks and leaves only the whitespace question,
    // and it still fails against the pre-fix lowerer, which rendered
    // `The limit is 5tonight`.
    const interpolated = render(`const LIMIT = 5

ALICE:
  The limit is {LIMIT} tonight
  and it holds all night.
`);
    const literal = render(`ALICE:
  The limit is 5 tonight
  and it holds all night.
`);
    expect(interpolated).toBe(literal);
    expect(interpolated).toContain("The limit is 5 tonight");
    expect(interpolated).not.toContain("  and it holds");
  });

  test("text after an inline-glued alternator keeps its leading space", () => {
    // The alternator is a non-text segment like an interpolation, so the text
    // after its closing `..` also begins mid-line. Without this the arm fuses
    // onto the following word (`Before AAfter.`).
    expect(
      render(`ALICE:
  Before .. queue|A|B|C .. After.
`),
    ).toBe("Before A After.\n");
  });

  test("an inline asset directive reaches the engine with its spacing intact", () => {
    // `((audio))` and `[[visual]]` directives are not segmented by this
    // lowerer — they travel to the engine as literal display text, and the
    // engine's line parser removes each directive along with the whitespace
    // that follows it, leaving exactly one space at the junction. That only
    // works if the spacing the author typed survives compilation, so pin it
    // here. (The engine half is pinned in
    // `spark-engine/src/game/modules/interpreter/classes/InterpreterModule.test.ts`.)
    expect(
      render(`ALICE:
  The car ((sfx_vroom)) drove as he ((sfx_screech)) slammed.
`),
    ).toBe("The car ((sfx_vroom)) drove as he ((sfx_screech)) slammed.\n");
    expect(
      render(`ALICE:
  The car [[img_car]] drove.
`),
    ).toBe("The car [[img_car]] drove.\n");
  });

  test("the spacing survives an incremental recompile of the edited line", () => {
    // The whitespace decision reads the source character before a segment
    // (`ctx.read(seg.start - 1, seg.start)`), so it depends on the offsets and
    // the document text agreeing. On a keystroke the compiler reparses and
    // re-lowers only a window around the edit and carries the rest forward,
    // which is where an offset and a text that disagree would show up. Edit
    // the word right after the interpolation and recompile through the same
    // compiler instance, the way the editor does on every keystroke.
    const uri = "inmemory:///main.sd";
    const before = `const LIMIT = 5

ALICE:
  The limit is {LIMIT} tonight.
`;
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: before,
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const cold = compiler.compile({ textDocument: { uri } }).program;
    expect(cold.compiled).toBeTruthy();

    // Insert one character into `tonight`, on the line holding the
    // interpolation: line index 3, just before the final ".".
    const line = 3;
    const character = "  The limit is {LIMIT} tonight".length;
    compiler.updateDocument({
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          range: {
            start: { line, character },
            end: { line, character },
          },
          text: "!",
        },
      ],
    });
    const warm = compiler.compile({ textDocument: { uri } }).program;
    expect(warm.compiled).toBeTruthy();

    const story = new RuntimeStory(warm.compiled as Record<string, any>);
    story.collapseWhitespace = false;
    expect(runToEnd(story)).toBe("The limit is 5 tonight!.\n");
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
