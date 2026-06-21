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
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
  runToEnd,
} from "./runtimeTestHarness";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";

// Drive `Continue()` one beat at a time. A correctly-glued continuation
// joins onto the previous line's beat, so the whole join is a SINGLE
// `Continue()` boundary (mirrors `ChainedDialogueBreak.test.ts`).
function continueBeats(story: RuntimeStory): string[] {
  const beats: string[] = [];
  while (story.canContinue) beats.push(story.Continue() ?? "");
  return beats;
}

describe("Glue (ported from inkjs)", () => {
  test("simple glue across multiple lines", () => {
    // Ink's `Some <>\ncontent<> with glue.` uses trailing/leading `<>`
    // markers; sparkdown's `..` lives between whitespace boundaries.
    // Rewritten so each continuation line opens with ` .. ` — the same
    // pattern as the multiline-glue logic test, exercising the
    // `Glue` runtime marker's newline-suppression behavior.
    const ctx = makeRuntimeStoryFromFile("glue", "simple-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("trailing glue across multiple lines", () => {
    // The mirror of the leading-`..` fixture above: each line ends with a
    // trailing ` ..` glue marker instead of opening with one. The grammar
    // recognizes (and highlights) trailing `..` as a `Glue` node, but the
    // display lowerer used to read its raw `..` characters as literal text,
    // so the lines never joined. Both forms must produce the same joined
    // output, with the single space before `..` preserved as the word
    // separator (`Some ..` + `content` → `Some content`).
    const ctx = makeRuntimeStoryFromFile("glue", "trailing-glue");
    expect(ctx.errorMessages).toEqual([]);
    expect(runToEnd(ctx.story)).toBe("Some content with glue.\n");
  });

  test("multi-line content inside `if cond then ... end` (left-right glue)", () => {
    // Ink fixture wraps text in `{ f(): Another line. }` — sparkdown
    // maps the inline `{cond: text}` shorthand to the block form
    // `if cond then text end`. Test that the surrounding lines join
    // correctly across the block.
    const ctx = makeRuntimeStoryFromFile(
      "glue",
      "left-right-glue-matching",
    );
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

// Glue is not action-only: a `..` marker joins consecutive display lines of
// EVERY type (action, dialogue, heading, title, transitional, write), in both
// the leading (`.. text`) and trailing (`text ..`) positions. A correct join
// collapses the two lines into a SINGLE `Continue()` beat whose routing
// prefix appears ONCE — the continuation inherits the first line's display
// target. The raw beat text still carries the prefix (`ALICE:`, `$:`, …)
// because the prefix-stripping interpreter is a separate layer; the runtime
// concern here is the join + single beat + intact trailing newline.
describe("Glue — across all display statement types", () => {
  // [label, first-line text incl. prefix, raw joined beat]. The second line
  // re-uses the same prefix; the join drops it.
  const TYPES: { label: string; prefix: string; joined: string }[] = [
    { label: "action", prefix: "", joined: "first second.\n" },
    { label: "dialogue", prefix: "ALICE:", joined: "ALICE: first second.\n" },
    { label: "heading", prefix: "$:", joined: "$: first second.\n" },
    { label: "title", prefix: "^:", joined: "^: first second.\n" },
    { label: "transitional", prefix: "%:", joined: "%: first second.\n" },
    { label: "write", prefix: "@hud:", joined: "@hud: first second.\n" },
  ];

  for (const { label, prefix, joined } of TYPES) {
    const p = prefix ? `${prefix} ` : "";

    test(`trailing \`..\` joins two ${label} lines into one beat`, () => {
      const ctx = makeRuntimeStoryFromSource(`${p}first ..\n${p}second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      const beats = continueBeats(ctx.story);
      expect(beats).toEqual([joined]);
    });

    test(`leading \`..\` joins a continuation onto a ${label} line`, () => {
      // The continuation `.. second.` carries no prefix of its own (a
      // leading-`..` line is always parsed as a bare continuation) and
      // inherits the previous line's display target.
      const ctx = makeRuntimeStoryFromSource(`${p}first\n.. second.\n`);
      expect(ctx.errorMessages).toEqual([]);
      const beats = continueBeats(ctx.story);
      expect(beats).toEqual([joined]);
    });
  }

  test("a chain of trailing `..` joins three dialogue lines into one beat", () => {
    const ctx = makeRuntimeStoryFromSource(
      "ALICE: a ..\nALICE: b ..\nALICE: c.\n",
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(["ALICE: a b c.\n"]);
  });

  test("trailing `..` joins mid-body lines within a block dialogue", () => {
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first ..\n  second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(["ALICE: first second.\n"]);
  });

  test("leading `..` joins mid-body lines within a block dialogue", () => {
    // The separator space (after `.. `) must survive block-mode indentation
    // stripping, so the words don't fuse into `firstsecond`.
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  first\n  .. second.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(["ALICE: first second.\n"]);
  });

  test("a non-glued multi-line block dialogue still keeps its line breaks", () => {
    // Guard the block-mode fix: without a `..`, body lines stay on separate
    // lines (one beat, newline preserved between them).
    const ctx = makeRuntimeStoryFromSource("ALICE:\n  one.\n  two.\n");
    expect(ctx.errorMessages).toEqual([]);
    expect(continueBeats(ctx.story)).toEqual(["ALICE: one.\ntwo.\n"]);
  });
});

// Test C from upstream (`A\n{f():X}\nC` → `"A\nC\n"`) is intentionally
// not ported — it pins ink's specific "empty-interpolation-line is
// collapsed via implicit glue" behavior, which sparkdown does not
// share. In sparkdown, an interpolation that evaluates to empty still
// emits a `\n` for the line break (giving `"A\n\nC\n"`). Authors who
// want ink-C's exact behavior would write `if cond then "X"` inline
// with the surrounding text rather than on its own line.
