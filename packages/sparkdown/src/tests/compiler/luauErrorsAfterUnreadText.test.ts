import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { officialSyntaxErrors } from "./officialSyntax";

const URI = "inmemory:///main.sd";

function compile(text: string) {
  const c = new SparkdownCompiler();
  c.configure({
    files: [
      {
        uri: URI,
        type: "script",
        name: "main",
        ext: "sd",
        text,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  } as never);
  return (c.compile({ textDocument: { uri: URI } } as never) as any).program;
}

function errors(text: string): string[] {
  const found: string[] = [];
  for (const list of Object.values(compile(text).diagnostics ?? {}) as any[]) {
    for (const d of list) {
      if (d.severity !== 1) continue;
      const { start, end } = d.range;
      const message =
        typeof d.message === "string" ? d.message : d.message?.value;
      found.push(
        `${start.line}:${start.character}-${end.line}:${end.character} ${message}`,
      );
    }
  }
  return found;
}

function luauErrors(text: string): string[] {
  return officialSyntaxErrors(text).map(
    ({ message, location: { begin, end } }) =>
      `${begin.line}:${begin.column}-${end.line}:${end.column} ${message}`,
  );
}

describe("an assignment after an if expression's else value (#1205)", () => {
  it.each([
    [
      "on the next line",
      "function f()\n  local x = 0\n  x = if false then 1 else\n  x = 6\n  return x\nend\n",
    ],
    [
      "on the same line",
      "function f()\n  local x = 0\n  x = if false then 1 else x = 6\n  return x\nend\n",
    ],
  ])("%s, is Luau's error at Luau's range", (_name, text) => {
    const expected = luauErrors(text);
    expect(expected).toHaveLength(1);
    expect(errors(text)).toEqual(expected);
  });

  it("after a scene's `local` declaration, is the missing else value at the line's end", () => {
    expect(
      errors("-> start\nscene start\n  local a = false\n  local y = 0\n  local x = if a then 1 else\n    y = 6\nend\n"),
    ).toEqual(["4:28-5:0 Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("a table type annotation with a field written as an assignment (#1261)", () => {
  const TEXT = "function f(t)\n  local x: {\n    bar\n    baz = 1 +\n  } = {}\n  2\nend\n";

  it("reports Luau's first error at Luau's range", () => {
    const expected = luauErrors(TEXT);
    expect(expected[0]).toBe(
      "3:4-3:7 Expected '}' (to close '{' at line 2), got 'baz'",
    );
    expect(errors(TEXT)).toContain(expected[0]);
  });

  it("reports only errors Luau reports, each at Luau's range", () => {
    const expected = luauErrors(TEXT);
    for (const error of errors(TEXT)) {
      expect(expected).toContain(error);
    }
  });
});
