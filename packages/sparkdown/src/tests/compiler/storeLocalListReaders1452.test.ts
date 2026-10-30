import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

function errorsOf(diagnostics: readonly SparkDiagnostic[], all = false): string[] {
  return diagnostics
    .filter((d) => d.severity === DiagnosticSeverity.Error && (all || !NOT_SYNTAX.some((pattern) => pattern.test(messageOf(d)))))
    .map((d) => `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${messageOf(d)}`)
    .sort();
}

function newCompiler(text: string): SparkdownCompiler {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiler;
}

function compileErrors(compiler: SparkdownCompiler): string[] {
  return errorsOf(compiler.compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? []);
}

function sparkdownErrors(text: string): string[] {
  return compileErrors(newCompiler(text));
}

const PADDING = "function padding()\n  local p = 0\nend\n";

function expectIncrementalEqualsCold(text: string): void {
  const padded = PADDING + text;
  const offset = padded.indexOf("0");
  const compiler = newCompiler(padded);
  compiler.compile({ textDocument: { uri: URI } } as never);
  compiler.updateDocument({
    textDocument: { uri: URI, version: 2 },
    contentChanges: [{ range: { start: { line: 1, character: 12 }, end: { line: 1, character: 13 } }, text: "10000000000" }],
  } as never);
  const edited = padded.slice(0, offset) + "10000000000" + padded.slice(offset + 1);
  expect(compileErrors(compiler)).toEqual(sparkdownErrors(edited));
}

function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error
        .replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + (+sl === 0 ? shift : 0)}-${+el + line}:${+ec + (+el === 0 ? shift : 0)}`)
        .replace(/at column (\d+)\)/, (_, column) => `at column ${+column + shift})`)
        .replace(/at line (\d+)\)/, (_, at) => `at line ${+at + line})`),
    )
    .sort();
}

function atTopLevel(line: string): string {
  return line.replace(/^local\b/, "store");
}

function pinLine(luau: string, { topLevel = true, inScene = true } = {}): void {
  const line = atTopLevel(luau);
  const expected = official(`${luau}\n`);
  if (topLevel) {
    test(`${JSON.stringify(line)} before a scene`, () => {
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(expected);
      expectIncrementalEqualsCold(`${line}\n${SCENE}`);
    });
    test(`${JSON.stringify(line)} ending the document`, () => {
      expect(sparkdownErrors(`${line}\n`)).toEqual(expected);
      expectIncrementalEqualsCold(`${line}\n`);
    });
    test(`${JSON.stringify(line)} with no line break after it`, () => {
      expect(sparkdownErrors(line)).toEqual(official(luau));
    });
  }
  if (!inScene) return;
  test(`${JSON.stringify(luau)} in a scene`, () => {
    const text = `scene start\n  ${luau}\n  Hello.\nend\n`;
    expect(sparkdownErrors(text)).toEqual(official(`${luau}\n`, 1, 2));
    expectIncrementalEqualsCold(text);
  });
}

describe("a story local with a second value and no comma before it (I-1424)", () => {
  for (const line of ["local a = 1 2", "local a, b = 1 2", "local a = {1, 2} 3", "local a = 1 Hello"]) pinLine(line);
});

describe("a bare local with no name (I-1425)", () => {
  pinLine("local");
  pinLine("local -- note", { topLevel: false });
});

describe("a store name list with an empty slot before its end (I-1426)", () => {
  for (const line of ["local , = 1", "local a,, = 1", "local ,, = 1", "local , a = 1"]) pinLine(line);
});

describe("a declaration with its own errors whose line runs on into story", () => {
  const sameWords = ["local a = {1 ? 2} 2", "local a = {1 ? 2} 2 2", "local a,, = {1 ? 2} 2"];
  for (const line of ["local a,, = 1 2", "local , = 1 2", "local a, = 1 Hello", "local a = {1 2} 3", "local , = 1 Hello", ...sameWords]) {
    pinLine(line);
  }
});

describe("errors that share a token", () => {
  for (const line of ["local a = {1 ? 2}, {3 ? 4} 5", "local a = {1 ? 2}, {3 4}"]) pinLine(line);
});

describe("a declaration whose line holds another kind of error", () => {
  const lines = ["store , = 1", "store a,, = 1", "store a = 1 2", "store b = 1 Hello", "store", "store s = 1 g(x"];
  const text = `${lines.join("\n")}\n`;
  test("each line reports its own Luau errors", () => {
    const expected = lines.flatMap((line, i) => official(`${line.replace(/^store/, "local")}\n`, i)).sort();
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  for (const line of ["store a,, = 1 store b = 0", "store b = 0 store a,, = 1"]) {
    test(`${JSON.stringify(line)} after a store named b`, () => {
      const text = `store b = 0\n${line}\n${SCENE}`;
      const expected = official(`${line.replace(/store/g, "local")}\n`, 1);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(text)).toEqual(expected);
      expectIncrementalEqualsCold(text);
    });
  }
  test("a local in a scene named as a store reports its own Luau errors", () => {
    const scene = "store a,, = 1\nscene start\n  local a = 1 2\n  Hello.\nend\n";
    const expected = [...official("local a,, = 1\n"), ...official("local a = 1 2\n", 2, 2)].sort();
    expect(sparkdownErrors(scene)).toEqual(expected);
    expectIncrementalEqualsCold(scene);
  });
  test("the names declared twice are reported", () => {
    const errors = errorsOf(newCompiler(text).compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [], true);
    expect(errors.some((e) => e.includes("Duplicate identifier `a`")), "two stores named `a`").toBe(true);
  });
});

describe("a report in a declaration's span that is no report of its errors", () => {
  const VARARGS = "A `store` is set when the story starts";
  for (const line of ["store a, b, = ...", "store a, b = ... 2"]) {
    test(`${JSON.stringify(line)} reports its syntax error beside its \`...\` error`, () => {
      const errors = sparkdownErrors(`${line}\n`);
      const expected = official(`${line.replace(/^store/, "local")}\n`);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(errors.filter((e) => !e.includes(VARARGS))).toEqual(expected);
      expect(errors.some((e) => e.includes(VARARGS)), "the `...` error").toBe(true);
      expectIncrementalEqualsCold(`${line}\n`);
    });
  }
  for (const line of ["store a, b, c = {1 2}, ...", "store a, b, = {1 2}, ..."]) {
    test(`${JSON.stringify(line)} in a top-level block reports its value's error beside its \`...\` error`, () => {
      const text = `if true then\n  ${line}\nend\n${SCENE}`;
      const errors = sparkdownErrors(text);
      const expected = official(`${line.replace(/^store/, "local")}\n`, 1, 2);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(errors.filter((e) => !e.includes(VARARGS))).toEqual(expected);
      expect(errors.some((e) => e.includes(VARARGS)), "the `...` error").toBe(true);
      expectIncrementalEqualsCold(text);
    });
  }
  test("a compile stopped at another store", () => {
    const text = `store a = 1 // note\nstore b = 1 2\n${SCENE}`;
    const all = errorsOf(newCompiler(text).compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [], true);
    expect(all.some((e) => e.startsWith("0:0-") && e.includes("The compile stopped")), "the compile stopped at the first store").toBe(true);
    expect(sparkdownErrors(text)).toEqual(official("local a = 1 // note\nlocal b = 1 2\n"));
    expectIncrementalEqualsCold(text);
  });
});

describe("a declaration's span at its edges", () => {
  for (const text of ["store t = {1,\n  2 3}\n", "store t = {1,\n  2} 3\n"]) {
    test(`multi-line ${JSON.stringify(text)}`, () => {
      const expected = official(text.replace(/^store/, "local"));
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(text)).toEqual(expected);
      expect(sparkdownErrors(`${text}${SCENE}`)).toEqual(expected);
      expectIncrementalEqualsCold(`${text}${SCENE}`);
    });
  }
  test('multi-line "local t = {1,\\n    2} 3" in a scene', () => {
    const text = "scene start\n  local t = {1,\n    2} 3\n  Hello.\nend\n";
    const expected = official("local t = {1,\n    2} 3\n", 1, 2);
    expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  for (const line of ["local a,, = 1", "local a = 1 2", "local s = 1 g(x"]) {
    test(`${JSON.stringify(line)} indented four in a scene`, () => {
      const text = `scene start\n    ${line}\n  Hello.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(official(`${line}\n`, 1, 4));
      expectIncrementalEqualsCold(text);
    });
  }
  for (const line of ["x = 1 store a,, = 1", "x = 1 store a = 1 2"]) {
    test(`${JSON.stringify(line)}`, () => {
      const expected = official(`${line.replace(/store/g, "local")}\n`);
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(`${line}\n${SCENE}`)).toEqual(expected);
      expectIncrementalEqualsCold(`${line}\n${SCENE}`);
    });
  }
  test('"x = 1 local a = 1 2" in a scene', () => {
    const text = "scene start\n  x = 1 local a = 1 2\n  Hello.\nend\n";
    const expected = official("x = 1 local a = 1 2\n", 1, 2);
    expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  for (const [line, text, shift] of [
    ["store a = 1 2,", `store a = 1 2,\n${SCENE}`, 0],
    ["local a = 1 2,", "scene start\n  local a = 1 2,\n  Hello.\nend\n", 2],
  ] as const) {
    test(`${JSON.stringify(line)}${shift ? " in a scene" : ""}`, () => {
      const luau = `${line.replace(/^store/, "local")}\n`;
      expect(official(luau).some((e) => e.endsWith("got <eof>")), "the official parser reports the end of input").toBe(true);
      expect(sparkdownErrors(text)).toEqual(official(luau, shift ? 1 : 0, shift));
      expectIncrementalEqualsCold(text);
    });
  }
  test("a store's value missing at its line's end is reported once", () => {
    expect(sparkdownErrors(`store a = 1,\n${SCENE}`)).toEqual(["0:11-0:12 Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("a story store whose run-on value leaves a call open to its line's end (I-1477)", () => {
  for (const line of ["local s = 1 g(x", "local s = 1 g(", "local s = 1 g(x, y", "local s = 1 g(x -- note"]) pinLine(line);
});

describe("a story store or local whose value leaves a bracket open to its line's end (I-1490, I-1532)", () => {
  for (const value of ["g(x", "{1", "(1", "g(x, y", "{1, 2"]) pinLine(`local s = ${value}`);
  pinLine("local s = (1 -- note", { topLevel: false });
  for (const line of ["local s = g(x y)", "local s = {1 2}"]) pinLine(line);
});

function pinText(name: string, text: string, luau: string, line: number, shift: number): void {
  test(name, () => {
    expect(sparkdownErrors(text)).toEqual(official(luau, line, shift));
    expectIncrementalEqualsCold(text);
  });
}

describe("a story store or local whose unclosed bracket the tree reads on into story lines (I-1532)", () => {
  function pinBefore(line: string, after: readonly string[], what: string): void {
    const luau = `${line}\n`;
    const top = atTopLevel(line);
    pinText(`${JSON.stringify(line)} ${what} in a scene`, `scene start\n  ${line}\n${after.map((l) => `  ${l}\n`).join("")}end\n`, luau, 1, 2);
    pinText(`${JSON.stringify(top)} ${what}`, `${top}\n${after.map((l) => `${l}\n`).join("")}${SCENE}`, luau, 0, 0);
  }
  const values = ["g(x", "{1", "(1", "g(x, y", "{1, 2"];
  for (const value of values) pinBefore(`local s = ${value}`, ["Hello."], "before a story line");
  pinText('"local s = {1," before a line it would continue in a scene', "scene start\n  local s = {1,\n  2\nend\n", "local s = {1,\n", 1, 2);
  pinText('"store s = {1," before a line it would continue', "store s = {1,\n2\n" + SCENE, "local s = {1,\n", 0, 0);
  const stories = [["Hello there"], ["Hello:"], ["a.b("], ["Hello.", "Goodbye."], ["Hello there", "a.b(", "Goodbye"]];
  for (const lines of stories) {
    for (const line of ["local s = g(x", "local s = {1"]) pinBefore(line, lines, `before ${JSON.stringify(lines.join(" / "))}`);
  }
  const functionLines = ["local s = g(function()", "local s = g(function() if x then", "local s = {function()", "s = g(function()"];
  for (const block of ["while x", "if x", "for i = 1, 2", "for k in t", "repeat", "while x do", "return", "return {1", "return g(", "do", "if x then else", "for i = 1, 2 do"]) {
    functionLines.push(`local s = g(function() ${block}`, `s = g(function() ${block}`);
  }
  for (const line of functionLines) {
    pinBefore(line, ["return 1", "end", "Hello."], "before its body");
    pinBefore(line, ["Hello."], "before a story line");
  }
  pinLine("local s = g(function() return 1 end");
  for (const value of ["g(x.", "g(function() local a =", "g(function() return if x then 1", "g(function() if x and", "g(function() if x then elseif y and", "g(if x", "g(if x then 1"]) {
    for (const keyword of ["local s", "s"]) pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
  }
  for (const keyword of ["local s", "s"]) {
    pinBefore(`${keyword} = g(\`a {} b\``, ["Hello."], "before a story line");
    for (const quote of ['"', "'", "`"]) {
      pinBefore(`${keyword} = g(${quote}abc\\`, [`continued${quote}`, "Hello."], "continued on a story line");
    }
  }
  for (const keyword of ["local s", "s"]) {
    for (const value of ["g(function() return -- note", "g(function() return 1 -- note", "g(function() return 1 --[[note]]", "g(function() return 1; -- note"]) {
      pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
    }
  }
  for (const keyword of ["local s", "s"]) {
    for (const value of ['g("abc\\u{', "g(function() a,", "g(function() local a,"]) {
      pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
    }
    for (const quote of ['"', "'"]) {
      pinBefore(`${keyword} = g(${quote}abc\\z`, [`continued${quote}`, "Hello."], "continued on a story line");
    }
    for (const value of ["g(cycle | 1", "g(cycle | x."]) {
      const line = `${keyword} = ${value}`;
      test(`${JSON.stringify(line)} before story lines and a later arm`, () => {
        const text = `scene start\n  ${line}\n  Hello.\n  | (1 2)\nend\n`;
        expect(sparkdownErrors(text)).toEqual(sparkdownErrors(`scene start\n  ${line}\nend\n`));
        expectIncrementalEqualsCold(text);
      });
    }
  }
  pinLine("local s = g({1, (2");
  pinText('"local s = g(x, {" closing only its table on the next line', "scene start\n  local s = g(x, {\n  1}\n  Hello.\nend\n", "local s = g(x, {\n", 1, 2);
  for (const [name, text] of [
    ["a multi-line table in a scene", "scene start\n  local t = {\n    1,\n  }\n  Hello.\nend\n"],
    ["a multi-line table at the top level", `store t = {\n  1,\n}\n${SCENE}`],
    ["a multi-line call at the top level", `store s = math.max(1,\n  2)\n${SCENE}`],
    ["a multi-line call in a scene", "scene start\n  local s = math.max(1,\n    2)\n  Hello.\nend\n"],
  ]) {
    test(`${name} reads on with no error`, () => {
      expect(sparkdownErrors(text!)).toEqual([]);
      expectIncrementalEqualsCold(text!);
    });
  }
});
