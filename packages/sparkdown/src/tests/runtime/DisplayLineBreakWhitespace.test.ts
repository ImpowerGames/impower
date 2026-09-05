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

  test("an escaped whitespace break keeps no leading space", () => {
    expect(render("ALICE: hello\\ world\n")).toBe("hello\nworld\n");
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

  test("a multi-line body still breaks where the author broke it", () => {
    const out = render("ALICE:\n  first line\n  second line\n");
    expect(out).toContain("\n");
    expect(out).not.toContain("first linesecond line");
  });
});
