import { describe, expect, test } from "vitest";
import {
  makeRuntimeStoryFromFile,
  makeRuntimeStoryFromSource,
} from "./runtimeTestHarness";

describe("Builtin methods (strings)", () => {
  test("string method set", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "string-methods");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "HELLO, WORLD!",
        "hello, world!",
        "13",
        "!dlroW ,olleH",
        "ello",
        "ld!",
        "hi",
        "true",
        "true",
        "8",
        "nil",
        "Hello, Luau!",
        "ababab",
        "x-x-x",
        "00042",
        "42___",
        "H",
        "!",
        "",
      ].join("\n"),
    );
  });
});

describe("Chained method calls", () => {
  test("multi-level method chains return values flow correctly", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "chained");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1,2,3,4,5,6",
        "3|4",
        "2,1",
        "6",
        "2,3,4",
        "",
      ].join("\n"),
    );
  });
});

describe("Builtin methods (tables)", () => {
  test("table method set", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "table-methods");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "5",
        "1",
        "5",
        "3",
        "nil",
        "1-2-3-4-5",
        "5,4,3,2,1",
        "1,1,2,3,4,5,6,9",
        "2,3,4",
        "",
      ].join("\n"),
    );
  });

  test("min / max / random — comparison-based and probabilistic picks", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "min-max-random");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1",
        "9",
        "apple",
        "pear",
        "nil",
        "nil",
        "nil",
        "",
      ].join("\n"),
    );
  });

  test(":random() returns an element from the array portion", () => {
    const src = `store t = {10, 20, 30, 40, 50}\n{t:random()}\n`;
    const valid = new Set([10, 20, 30, 40, 50]);
    for (let i = 0; i < 50; i++) {
      const ctx = makeRuntimeStoryFromSource(src);
      expect(ctx.errorMessages).toEqual([]);
      const output = ctx.story.ContinueMaximally().trim();
      const picked = parseInt(output, 10);
      expect(valid.has(picked)).toBe(true);
    }
  });

  test("set operations (union / intersection / difference / some / every)", () => {
    const ctx = makeRuntimeStoryFromFile("methods", "set-ops");
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      [
        "1,2,3,4,5,6",
        "3,4",
        "1,2",
        "true",
        "false",
        "true",
        "false",
        "",
      ].join("\n"),
    );
  });
});

describe("String library methods (I-856)", () => {
  const run = (expr: string) => {
    const ctx = makeRuntimeStoryFromSource(
      `function run() return ${expr} end\n\nGot {run()}.\n`,
    );
    expect(ctx.errorMessages).toEqual([]);
    return ctx.story.ContinueMaximally();
  };

  test.each([
    [`("abc"):byte(1, 2)`, `string.byte("abc", 1, 2)`],
    [`("%d-%s"):format(5, "x")`, `string.format("%d-%s", 5, "x")`],
    [`("abc"):contains("b")`, `string.contains("abc", "b")`],
    [`("i4"):packsize()`, `string.packsize("i4")`],
    [`("i4"):pack(1):len()`, `string.pack("i4", 1):len()`],
    [`("i4"):unpack("abcd")`, `string.unpack("i4", "abcd")`],
  ])("%s gives what %s gives", (method, library) => {
    expect(run(method)).toBe(run(library));
  });

  test("method forms give the library values", () => {
    const ctx = makeRuntimeStoryFromSource(
      [
        `function words()`,
        `  local parts = {}`,
        `  for w in ("a b"):gmatch("%a") do`,
        `    table.insert(parts, w)`,
        `  end`,
        `  return table.concat(parts, ",")`,
        `end`,
        `-> start`,
        `scene start`,
        `  local a, b = ("abc"):byte(1, 2)`,
        `  {a} {b} {("%d-%s"):format(5, "x")} {("abc"):contains("b")} {("i4"):packsize()} {words()}`,
        `end`,
        ``,
      ].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("97 98 5-x true 4 a,b\n");
  });

  test("a string's member is its string library function", () => {
    const ctx = makeRuntimeStoryFromSource(
      [
        `-> start`,
        `scene start`,
        `  local s = "abc"`,
        `  {s:byte(1)} {s.byte(s, 2)} {type(s.byte)} {type(("x").format)} {type(s.nope)}`,
        `end`,
        ``,
      ].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(
      "97 98 function function nil\n",
    );
  });

  test("a table receiver calls its own field of the same name", () => {
    const ctx = makeRuntimeStoryFromSource(
      [
        `store t = {}`,
        `function t:format(x) return "own " .. x end`,
        `function t:byte() return "own byte" end`,
        ``,
        `{t:format("f")} / {t:byte()}`,
        ``,
      ].join("\n"),
    );
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe("own f / own byte\n");
  });
});
