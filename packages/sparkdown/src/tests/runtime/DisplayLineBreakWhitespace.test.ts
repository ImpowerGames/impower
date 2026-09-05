// A line break inside a display body carries no whitespace of its own.
// Whatever the author wrote around the break is what reaches the story
// text: the indentation that puts a block body under its cue is stripped,
// and nothing is put back in its place.
//
// Every assertion here runs with `collapseWhitespace` disabled, because
// that is how the engine runs stories (`spark-engine`'s `Game` sets
// `story.collapseWhitespace = false`). Ink's own default collapses runs of
// whitespace and would hide the difference between one space and two.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource, runToEnd } from "./runtimeTestHarness";

function render(source: string): string {
  const ctx = makeRuntimeStoryFromSource(source);
  expect(ctx.errorMessages).toEqual([]);
  ctx.story.collapseWhitespace = false;
  return runToEnd(ctx.story);
}

describe("display line-break whitespace", () => {
  test("a continuation line in a dialogue body keeps no leading space", () => {
    expect(render("ALICE:\n  first line\n  second line\n")).toBe(
      "first line\nsecond line\n",
    );
  });

  test("every continuation line in an action body keeps no leading space", () => {
    expect(render("$:\n  one\n  two\n  three\n")).toBe("one\ntwo\nthree\n");
  });

  test("trailing `..` glue joins the two lines with a single space", () => {
    expect(render("ALICE:\n  first ..\n  second\n")).toBe("first second\n");
  });

  test("leading `.. ` glue joins the two lines with a single space", () => {
    expect(render("ALICE:\n  first\n  .. second\n")).toBe("first second\n");
  });

  // A line break and a `{...}` interpolation are lowered by different parts
  // of the same function, and both decide what happens to a space. Pinned
  // together so a later change to one cannot quietly eat the other's.
  test("a break and an interpolation each keep their own spacing", () => {
    expect(
      render("store n = 5\nALICE:\n  The limit is {n} tonight.\n  Sleep well.\n"),
    ).toBe("The limit is 5 tonight.\nSleep well.\n");
  });

  // A backslash before a space, a tab, or a line ending is one rule with
  // three triggers, so all three are pinned rather than the one that is
  // easiest to write.
  test("an escaped space break keeps no leading space", () => {
    expect(render("ALICE: hello\\ world\n")).toBe("hello\nworld\n");
  });

  test("an escaped tab break keeps no leading space", () => {
    expect(render("ALICE: hello\\\tworld\n")).toBe("hello\nworld\n");
  });

  test("an escaped line-ending break keeps no leading space", () => {
    expect(render("ALICE:\n  hello\\\n  world\n")).toBe("hello\nworld\n");
  });

  // An escape sits inside a text segment while an interpolation is a segment
  // of its own, so the two land either side of a segment edge in a block
  // body. Pinned on both orders, the edge being where the break's rule and
  // the separator's rule meet.
  test("an escaped break before an interpolation in a block body", () => {
    expect(render("store n = 5\nALICE:\n  hello\\ {n} world\n")).toBe(
      "hello\n5 world\n",
    );
  });

  test("an escaped break after an interpolation in a block body", () => {
    expect(render("store n = 5\nALICE:\n  hello {n}\\ world\n")).toBe(
      "hello 5\nworld\n",
    );
  });

  // Positive controls. These hold both before and after the fix, so a red
  // run above is the defect rather than a broken harness or a wrong
  // `collapseWhitespace` setting.
  test("a single-line body renders exactly as written", () => {
    expect(render("ALICE: first line\n")).toBe("first line\n");
  });

  test("interior spacing the author wrote is preserved verbatim", () => {
    expect(render("ALICE: two  spaces here\n")).toBe("two  spaces here\n");
  });

  // The condition both tickets name as what must stay true: a break still
  // breaks, and the words on either side of it do not fuse. Trimming each
  // line makes this hold regardless of the whitespace the tests above pin,
  // which is what keeps it a control rather than a second copy of them.
  test("a multi-line body still breaks where the author broke it", () => {
    const lines = render("$:\n  alpha\n  beta\n  gamma\n").split("\n");
    expect(lines.map((l) => l.trim()).filter((l) => l.length > 0)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});
