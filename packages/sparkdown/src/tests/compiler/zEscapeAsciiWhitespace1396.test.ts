// A `\z` escape skips only Luau's whitespace, a space or `\t` through `\r`
// (I-1396): a no-break space or any other Unicode space after it stays in
// the string, in a quoted string, an interpolated one and a story line.
import { describe, expect, test } from "vitest";
import { processLuauEscapes } from "../../compiler/utils/stringLiteralValue";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";

const bs = String.fromCharCode(92);
const UNICODE_SPACES = [0xa0, 0x2003, 0x3000, 0x2028, 0xfeff].map((c) => String.fromCharCode(c));

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, output: ctx.story.ContinueMaximally() };
};

describe("processLuauEscapes z escape", () => {
  test.each(UNICODE_SPACES)("keeps U+%s after the escape", (space) => {
    expect(processLuauEscapes("a" + bs + "z" + space + "b")).toBe("a" + space + "b");
  });

  test("skips a space and every control from tab through carriage return", () => {
    expect(processLuauEscapes("a" + bs + "z \t\n\v\f\r b")).toBe("ab");
  });

  test("stops at the first Unicode space after ASCII whitespace", () => {
    expect(processLuauEscapes("a" + bs + "z \n" + UNICODE_SPACES[0] + " b")).toBe("a" + UNICODE_SPACES[0] + " b");
  });
});

describe("compiled strings keep a Unicode space after the z escape", () => {
  const nbsp = UNICODE_SPACES[0]!;

  test("a quoted string in a story line's interpolation", () => {
    const { errors, output } = run(`scene start\n  Value is {"a${bs}z${nbsp}b"}\nend\n`);
    expect(errors).toEqual([]);
    expect(output).toBe(`Value is a${nbsp}b\n`);
  });

  test("an interpolated string's text", () => {
    const { errors, output } = run("scene start\n  Value is {`a" + bs + "z" + nbsp + "b{1}`}\nend\n");
    expect(errors).toEqual([]);
    expect(output).toBe(`Value is a${nbsp}b1\n`);
  });

  test("a print", () => {
    const { output } = run(`scene start\n  & print("a${bs}z${nbsp}b")\nend\n`);
    expect(output).toContain(`a${nbsp}b`);
  });
});
