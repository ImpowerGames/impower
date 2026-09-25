// Ported from inkjs `src/tests/specs/ink/Glue.spec.ts`.
//
// Glue itself is well-exercised by the existing `Logic.test.ts`
// "multiline logic with glue" test. This file ports inkjs's dedicated
// glue spec for parity coverage. Most inkjs glue tests rely on ink's
// function-as-subroutine semantics (functions that emit narrative text
// into the output stream during evaluation), which sparkdown's
// expression-returning `function ... end` doesn't model — same
// divergence flagged in `Newlines.test.ts` and `CallStack.test.ts`.

import { describe, expect, test } from "vitest";
import {
  continueShowedSomething,
  displayRouting,
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

// Drive `Continue()` one beat at a time. A correctly-glued continuation
// joins onto the previous line's beat, so the whole join is a SINGLE
// `Continue()` boundary (mirrors `ChainedDialogueBreak.test.ts`).

// Each beat's text paired with the routing of each of its `display()`
// tables. Routing lives in the tables rather than a `<prefix>:` in the
// visible text, so the tables are what show which line a joined beat is
// routed by.
type Routing = { target?: string; character?: string };
function beatsWithRouting(story: RuntimeStory): [string, Routing[]][] {
  const beats: [string, Routing[]][] = [];
  while (story.canContinue) {
    const text = story.Continue() ?? "";
    if (!continueShowedSomething(story)) continue;
    beats.push([text, displayRouting(story)]);
  }
  return beats;
}

describe("Glue (ported from inkjs)", () => {
  test("simple glue across multiple lines", () => {
    // Ink's `Some <>\ncontent<> with glue.` glues mid-word; sparkdown's
    // `..` marks both lines, and marks touching the words (`con..` then
    // `..tent`) join with no space.
    const ctx = makeRuntimeStoryFromFile("glue", "simple-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("trailing glue across multiple lines", () => {
    // Each line ends with a spaced ` ..`, and the space before `..` is the
    // word separator (`Some ..` + `.. content` → `Some content`).
    const ctx = makeRuntimeStoryFromFile("glue", "trailing-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("multi-line content inside `if cond then ... end` (left-right glue)", () => {
    // Ink fixture wraps text in `{ f(): Another line. }` — sparkdown
    // maps the inline `{cond: text}` shorthand to the block form
    // `if cond then text end`. Test that the surrounding lines join
    // correctly across the block.
    const ctx = makeRuntimeStoryFromFile("glue", "left-right-glue-matching");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A line.\nAnother line.\n");
  });
});

describe("Glue — ported from ink fixture rewrites", () => {
  test("inline interpolation of function-return string (rewrite of inkjs `implicit_inline_glue.ink`)", () => {
    // Upstream ink fixture relies on a function emitting narrative
    // ("five") via implicit inline glue:
    //   I have {five()} eggs.
    //   == function five == {false:...} five
    // Sparkdown's functions are expression-only, so the rewrite uses
    // `function five() return "five" end` and the inline `{five()}`
    // interpolation pulls the returned value into the line. Same
    // observable output, different mechanism (value return vs implicit
    // narrative emission). Validates that `{func()}` interpolation
    // inlines a function's return value into surrounding display text.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-function-return-in-interp",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("I have five eggs.\n");
  });

  test("inline conditional that emits nothing trims trailing space (rewrite of inkjs `implicit_inline_glue_b.ink`)", () => {
    // Upstream ink fixture:
    //   A {f():B}
    //   X
    //   === function f() === {true: ~ return false}
    // The function returns false, so `{f():B}` emits nothing. The line
    // "A {f():B}" reduces to "A " then sparkdown's display lowerer
    // trims trailing whitespace from the last text segment, leaving
    // "A". Output is "A\nX\n", matching ink's expected behavior here.
    // Validates the inline `if … then …` (no else) collapse-to-empty
    // semantics inside display text.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "inline-conditional-empty-then",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("A\nX\n");
  });
});

// Glue is not action-only: a `..` that ends a line joins the next display line
// that begins with `..` onto it for EVERY type (action, dialogue, heading,
// title, transitional, write), spaced (`text ..`) or touching (`text..`). A
// correct join collapses the two lines into a SINGLE `Continue()` beat with its
// trailing newline intact.
//
// Routing is carried by each line's `display()` table, not by a `<prefix>:`
// in the visible text. So the joined beat's TEXT is prefix-free, and the beat
// takes the first table's routing. An action continuation names none, so it
// takes the routing of the line it joins; every other kind keeps its own.
describe("Glue - across all display statement types", () => {
  const TYPES: { label: string; prefix: string; routing: Routing }[] = [
    { label: "action", prefix: "", routing: { target: "action" } },
    {
      label: "dialogue",
      prefix: "ALICE:",
      routing: { target: "dialogue", character: "ALICE" },
    },
    { label: "heading", prefix: "$:", routing: { target: "heading" } },
    { label: "title", prefix: "^:", routing: { target: "title" } },
    {
      label: "transitional",
      prefix: "%:",
      routing: { target: "transitional" },
    },
    { label: "write", prefix: "@hud:", routing: { target: "hud" } },
  ];
  const JOINED = "first second.\n";
  const ALICE: Routing = { target: "dialogue", character: "ALICE" };

  for (const { label, prefix, routing } of TYPES) {
    const p = prefix ? `${prefix} ` : "";
    const own = label === "action" ? {} : routing;

    test(`trailing \`..\` joins two ${label} lines into one beat`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first ..\n${p}.. second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([[JOINED, [routing, own]]]);
    });

    test(`touching \`..\` joins two ${label} lines with no space`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first..\n${p}..second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([
        ["firstsecond.\n", [routing, own]],
      ]);
    });

    test(`a \`..\` on one side only leaves two ${label} lines apart`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first ..\n${p}second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      expect(beatsWithRouting(ctx.story)).toEqual([
        ["first\n", [routing]],
        ["second.\n", [routing]],
      ]);
    });
  }

  test("a chain of trailing `..` joins three dialogue lines into one beat", () => {
    const ctx = makeRuntimeStoryFromSource(
      "ALICE: a ..\nALICE: .. b ..\nALICE: .. c.\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([
      ["a b c.\n", [ALICE, ALICE, ALICE]],
    ]);
  });

  test("trailing `..` joins mid-body lines within a block dialogue", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first ..\n  .. second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([[JOINED, [ALICE]]]);
  });

  test("touching `..` joins mid-body lines within a block dialogue", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first..\n  ..second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([
      ["firstsecond.\n", [ALICE]],
    ]);
  });

  test("a non-glued multi-line block dialogue still keeps its line breaks", () => {
    // Guard the block-mode fix: without a `..`, body lines stay on separate
    // lines (one beat, newline preserved between them).
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  one.\n  two.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(beatsWithRouting(ctx.story)).toEqual([["one.\ntwo.\n", [ALICE]]]);
  });
});

// Test C from upstream (`A\n{f():X}\nC` → `"A\nC\n"`) is intentionally
// not ported — it pins ink's specific "empty-interpolation-line is
// collapsed via implicit glue" behavior, which sparkdown does not
// share. In sparkdown, an interpolation that evaluates to empty still
// emits a `\n` for the line break (giving `"A\n\nC\n"`). Authors who
// want ink-C's exact behavior would write `if cond then "X"` inline
// with the surrounding text rather than on its own line.
