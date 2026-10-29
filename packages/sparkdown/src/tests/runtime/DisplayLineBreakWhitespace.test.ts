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
    expect(render("ALICE:\n  first ..\n  .. second\n")).toBe("first second\n");
  });

  test("touching `..` glue joins the two lines with no space", () => {
    expect(render("ALICE:\n  first..\n  ..second\n")).toBe("firstsecond\n");
  });

  test("a break and an interpolation each keep their own spacing", () => {
    expect(
      render("store n = 5\nALICE:\n  The limit is {n} tonight.\n  Sleep well.\n"),
    ).toBe("The limit is 5 tonight.\nSleep well.\n");
  });

  test("an escaped space break keeps no leading space", () => {
    expect(render("ALICE: hello\\ world\n")).toBe("hello\nworld\n");
  });

  test("an escaped tab break keeps no leading space", () => {
    expect(render("ALICE: hello\\\tworld\n")).toBe("hello\nworld\n");
  });

  test("an escaped line-ending break keeps no leading space", () => {
    expect(render("ALICE:\n  hello\\\n  world\n")).toBe("hello\nworld\n");
  });

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

  test("a single-line body renders exactly as written", () => {
    expect(render("ALICE: first line\n")).toBe("first line\n");
  });

  test("interior spacing the author wrote is preserved verbatim", () => {
    expect(render("ALICE: two  spaces here\n")).toBe("two  spaces here\n");
  });

  test("a multi-line body still breaks where the author broke it", () => {
    const lines = render("$:\n  alpha\n  beta\n  gamma\n").split("\n");
    expect(lines.map((l) => l.trim()).filter((l) => l.length > 0)).toEqual([
      "alpha",
      "beta",
      "gamma",
    ]);
  });
});
