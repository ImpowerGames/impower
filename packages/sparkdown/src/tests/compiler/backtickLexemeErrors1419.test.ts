import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

function sparkdownErrors(text: string): string[] {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error.replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + shift}-${+el + line}:${+ec + shift}`),
    )
    .sort();
}

describe("a rejected backtick string is read as Luau's lexemes (I-1419)", () => {
  const bodies = [
    "`a {x} b`",
    "local t = (1 `a {x} b`)",
    "`a {x} b {y} c`",
    "local t = (1 `a {x} b {y} c`)",
    "local t = g(1 `a {x} b`)",
    "local t = {1 `a {x} b`}",
    "local t = 1 `a {x} b`",
    "x = 1 `a {x} b`",
    "for i `a {x} b` do end",
    "local x: `a {x} b` = 1",
    "g `a {x} b`",
    "local t = (`a {x} b` `c {y} d`)",
    "`a {} b`",
    "local t = (1 `a {} b`)",
    "`a {x} b",
    "`a {x} b {y} c",
    "local t = (1 `a {x} b)",
    "local s = (1 `a {x} b {y)",
    "local s: `a {} b` = 1",
    "local s: `a {x} b",
    "local s: `a {1 2} b` = 1",
    "while true `a {x} b` do end",
    "for k in t `a {x} b` do end",
    "function `a {x} b {} c`() end",
    "local function g(`a {x} b {} c`) end",
  ];
  for (const body of bodies) {
    test(`a function's ${body}`, () => {
      const luau = `function f()\n${body}\nend\n`;
      const expected = official(luau);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${luau}Go {f()}.\n`)).toEqual(expected);
    });
  }

  test("the ticket's reproduction", () => {
    expect(sparkdownErrors("function f()\n`a {x} b`\nend\nGo {f()}.\n")).toEqual(
      [
        "1:0-1:4 Expected identifier when parsing expression, got `a {",
        "1:4-1:5 Incomplete statement: expected assignment or a function call",
        "1:5-1:9 Expected identifier when parsing expression, got } b`",
      ].sort(),
    );
    expect(sparkdownErrors("function f()\nlocal t = (1 `a {x} b`)\nend\nGo {f()}.\n")).toEqual(
      [
        "1:13-1:17 Expected ')' (to close '(' at column 11), got `a {",
        "1:17-1:18 Incomplete statement: expected assignment or a function call",
        "1:18-1:22 Expected identifier when parsing expression, got } b`",
        "1:22-1:23 Expected identifier when parsing expression, got ')'",
      ].sort(),
    );
  });
});

function placements(rest: string): [string, string, string[]][] {
  const luau = `local ${rest}\n`;
  return [
    ["store", `store ${rest}\n${SCENE}`, official(luau)],
    ["store alone", `store ${rest}\n`, official(luau)],
    ["a scene-level local", `scene start\n  local ${rest}\n  Hello.\nend\n`, official(`\n  ${luau}`)],
    ["a function's local", `function f()\n  local ${rest}\n  return s\nend\n`, official(`function f()\n  ${luau}  return s\nend\n`)],
  ];
}

describe("a rejected backtick string in a story statement is read as Luau's lexemes (I-1419)", () => {
  const unfinished = ["s = (1 `a {} b)", "s = (1\n  `a {x} b)"];
  for (const rest of ["s = (1 `a {x} b`)", "s = {1 `a {x} b`}", "s = (1 `a {} b`)", "s = (1\n  `a {} b`)", "s = {1,\n  2 `a {} b`}", "s = (\n  `a {} b`)", "s = x.`a {} b`", ...unfinished]) {
    for (const [form, text, luauExpected] of placements(rest)) {
      if (unfinished.includes(rest) && form === "a scene-level local") continue;
      const unclosed = rest === "s = (1\n  `a {x} b)" && form.startsWith("store");
      const expected = unclosed ? official(`local ${rest.slice(0, rest.indexOf("\n"))}\n`) : luauExpected;
      test(`${form} ${rest}`, () => {
        expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(expected);
      });
    }
  }
});

describe("an empty interpolation reports Luau's error at the string's opening section (I-1420)", () => {
  for (const rest of ["s = `a {} b`", "s = `{}`", "s = `a {x} b {} c`", "s = `a {} b {} c`", "s = `a {} b {c} d`", "s = `a {} b {1 2} c`", "s = `a {} b", "s = `a {} b {c} d"]) {
    for (const [form, text, expected] of placements(rest)) {
      test(`${form} ${rest}`, () => {
        expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
        expect(sparkdownErrors(text)).toEqual(expected);
      });
    }
  }

  test("the ticket's reproduction", () => {
    const message = "Malformed interpolated string, expected expression inside '{}'";
    expect(official("local s = `a {} b`\n")).toEqual([`0:10-0:14 ${message}`]);
    expect(sparkdownErrors(`store s = \`a {} b\`\n${SCENE}`)).toEqual([`0:10-0:14 ${message}`]);
    expect(sparkdownErrors(`scene start\n  local s = \`a {} b\`\n  Hello.\nend\n`)).toEqual([`1:12-1:16 ${message}`]);
    expect(sparkdownErrors(`function f()\n  local s = \`a {} b\`\n  return s\nend\n${SCENE}`)).toEqual([`1:12-1:16 ${message}`]);
  });

  test("a double-quoted string's {} is Sparkdown's own", () => {
    expect(sparkdownErrors(`store s = "a {} b"\n${SCENE}`).filter((e) => /expected expression inside/.test(e))).toHaveLength(1);
  });
});

describe("a rejected backtick string in a body a lowerer reads is read as Luau's lexemes (I-1419)", () => {
  for (const body of ["`a {} b`", "local t = (1 `a {} b`)", "`a {x} b {} c`"]) {
    const expected = () => official(`\n\n    ${body}\n`);
    test(`a define's method ${body}`, () => {
      expect(expected().length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`define Thing with\n  run()\n    ${body}\n  end\nend\n`)).toEqual(expected());
    });
    test(`a Sparkle handler ${body}`, () => {
      expect(sparkdownErrors(`layout main with\n  button @click={\n    ${body}\n  }\nend\n`)).toEqual(expected());
    });
  }
});

test("an incremental compile reports what a cold one does", () => {
  let text = "store s = `a {} b`\n\nscene start\n  local t = `a {x} b\n  Hello.\nend\n";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  compiler.compile({ textDocument: { uri: URI } } as never);
  const positionAt = (offset: number) => {
    const lines = text.slice(0, offset).split("\n");
    return { line: lines.length - 1, character: lines[lines.length - 1]!.length };
  };
  const steps: [() => number, string, number][] = [
    [() => text.indexOf("`a {} b`"), "(1 ", 0],
    [() => text.indexOf("`a {} b`") + 8, ")", 0],
    [() => text.indexOf("`a {x} b"), "(1 ", 0],
    [() => text.indexOf("(1 `a {} b`)"), "", 3],
    [() => text.indexOf("`a {} b`)") + 8, "", 1],
    [() => text.indexOf("(1 `a {x} b"), "", 3],
  ];
  let version = 1;
  for (const [at, insert, removed] of steps) {
    const offset = at();
    version += 1;
    compiler.updateDocument({
      textDocument: { uri: URI, version },
      contentChanges: [{ range: { start: positionAt(offset), end: positionAt(offset + removed) }, text: insert }],
    } as never);
    text = text.slice(0, offset) + insert + text.slice(offset + removed);
    const incremental = (compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [])
      .filter((d) => d.severity === DiagnosticSeverity.Error && !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d))))
      .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
      .sort();
    expect(incremental, `after version ${version}`).toEqual(sparkdownErrors(text));
  }
  expect(text).toBe("store s = `a {} b`\n\nscene start\n  local t = `a {x} b\n  Hello.\nend\n");
});

describe("an unfinished string's last section after a stray token is a malformed string (I-1421)", () => {
  test("store s = `a {1 2} b", () => {
    const expected = official("local s = `a {1 2} b\n");
    expect(expected).toContain("0:17-0:20 Expected identifier when parsing expression, got malformed string");
    expect(sparkdownErrors("store s = `a {1 2} b\n")).toEqual(expected);
  });
  for (const rest of ["s = `a {1 2} b", "s = `a {1 2} b {c} d"]) {
    test(`store ${rest}`, () => {
      expect(sparkdownErrors(`store ${rest}\n`)).toEqual(official(`local ${rest}\n`));
    });
    test(`a scene-level local ${rest}`, () => {
      expect(sparkdownErrors(`scene start\n  local ${rest}\n  Hello.\nend\n`)).toEqual(official(`local ${rest}\n`, 1, 2));
    });
    test(`a function's local ${rest}`, () => {
      const luau = `function f()\n  local ${rest}\n  return s\nend\n`;
      expect(sparkdownErrors(luau)).toEqual(official(luau));
    });
  }
  for (const [text, error] of [
    ["store s = cycle `a {} b` | 'c' end\n", "0:16-0:20"],
    ["store s = shuffle `a {} b` | 'c' end\n", "0:18-0:22"],
    ["scene start\n  local s = cycle `a {} b` | 'c' end\n  Hello.\nend\n", "1:18-1:22"],
    ["scene start\n  Hello {cycle `a {} b` | 'c' end}.\nend\n", "1:15-1:19"],
  ] as const) {
    test(`an alternator's ${text.split("\n").find((line) => line.includes("`"))!.trim()}`, () => {
      expect(sparkdownErrors(text)).toEqual([`${error} Malformed interpolated string, expected expression inside '{}'`]);
    });
  }
  test("store s = `a {1 2} b {c", () => {
    expect(sparkdownErrors("store s = `a {1 2} b {c\n")).toEqual(official("local s = `a {1 2} b {c\n"));
  });
  test("a function's local s = `a {1 2} b {c", () => {
    expect(sparkdownErrors("function f()\n  local s = `a {1 2} b {c\n")).toEqual(official("function f()\n  local s = `a {1 2} b {c\n"));
  });
});
