// The store and local list readers' follow-ups (I-1452), each form reporting
// the official parser's errors once, in Luau's words at Luau's ranges: a
// story local with a second value and no comma before it (I-1424), a bare
// local with no name (I-1425), a store name list with an empty slot before
// its end (I-1426), and a story store whose run-on value leaves a call open
// to the end of its line (I-1477), and a story store or local whose own value
// leaves a bracket open to the end of its line (I-1490). A store reports what the declaration
// spelled with `local`, as wide as `store`, does. Each declaration is
// spelled `store` at the top level and `local` in a scene, where the other
// spelling is a placement error (I-1673).
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity, type SparkDiagnostic } from "../../compiler/types/SparkDiagnostic";
import { officialErrorList } from "./officialSyntax";
import { messageOf, NOT_SYNTAX } from "./luauSyntaxReadings";

const URI = "inmemory:///main.sd";
const SCENE = "scene start\n  Hello.\nend\n";

/** Syntax errors (with `all`, every error), as `start-end message` in 0-based lines and characters, sorted. */
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

/** A cold compile's syntax errors. */
function sparkdownErrors(text: string): string[] {
  return compileErrors(newCompiler(text));
}

// A function ahead of the form, whose `0` an edit makes longer: the edit is
// away from the form, on a line before it, and changes no line count.
const PADDING = "function padding()\n  local p = 0\nend\n";

/** Asserts that an edit in `PADDING` ahead of `text` reports what a cold compile of the edited text does. */
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

/**
 * The official parser's errors for a line, moved down by `line` lines and
 * right by `shift` characters, with the bracket positions their messages
 * name (`at column 6`, `at line 2`) moved too.
 */
function official(text: string, line = 0, shift = 0): string[] {
  return officialErrorList(text)
    .map((error) =>
      error
        // A position on a later line than the text's first is not moved right.
        .replace(/^(\d+):(\d+)-(\d+):(\d+)/, (_, sl, sc, el, ec) => `${+sl + line}:${+sc + (+sl === 0 ? shift : 0)}-${+el + line}:${+ec + (+el === 0 ? shift : 0)}`)
        .replace(/at column (\d+)\)/, (_, column) => `at column ${+column + shift})`)
        .replace(/at line (\d+)\)/, (_, at) => `at line ${+at + line})`),
    )
    .sort();
}

/** A declaration's `local` spelling as the top level spells it, with `store`. */
function atTopLevel(line: string): string {
  return line.replace(/^local\b/, "store");
}

/**
 * Pins a declaration's errors, given in its `local` spelling: (unless
 * `topLevel` is false) spelled `store` before a scene, ending the document
 * and with no line break after it, and (unless `inScene` is false) spelled
 * `local` in a scene, cold and incremental.
 */
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

// A store's comment after the declaration moves its range (I-1533), so the
// form with a comment is pinned as a local, in a scene.
describe("a bare local with no name (I-1425)", () => {
  pinLine("local");
  pinLine("local -- note", { topLevel: false });
});

describe("a store name list with an empty slot before its end (I-1426)", () => {
  for (const line of ["local , = 1", "local a,, = 1", "local ,, = 1", "local , a = 1"]) pinLine(line);
});

// A declaration with errors of its own reports the story its line runs on
// into too, whose only reader is the declaration's (round 1).
describe("a declaration with its own errors whose line runs on into story", () => {
  // Errors of the declaration and of its story in the same words are two
  // errors (`{1 ? 2} 2`, round 2).
  const sameWords = ["local a = {1 ? 2} 2", "local a = {1 ? 2} 2 2", "local a,, = {1 ? 2} 2"];
  for (const line of ["local a,, = 1 2", "local , = 1 2", "local a, = 1 Hello", "local a = {1 2} 3", "local , = 1 Hello", ...sameWords]) {
    pinLine(line);
  }
});

// Two errors at one token, or one at another's opener, are two errors, and
// a report of one is no report of the other (round 4).
describe("errors that share a token", () => {
  for (const line of ["local a = {1 ? 2}, {3 ? 4} 5", "local a = {1 ? 2}, {3 4}"]) pinLine(line);
});

// An error of another kind on a declaration's line, a name declared twice,
// reports something else and leaves the declaration's own (round 1).
describe("a declaration whose line holds another kind of error", () => {
  const lines = ["store , = 1", "store a,, = 1", "store a = 1 2", "store b = 1 Hello", "store", "store s = 1 g(x"];
  const text = `${lines.join("\n")}\n`;
  test("each line reports its own Luau errors", () => {
    const expected = lines.flatMap((line, i) => official(`${line.replace(/^store/, "local")}\n`, i)).sort();
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  // A collision of another declaration on the line is that declaration's
  // (round 3).
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

// A report in a declaration's span that reports none of its errors leaves
// them reported (the round-3 repair): a store's `...` error, which ranges
// the statement, and a compile that stopped at another statement.
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
  // A statement's report leaves out its indent (round 4).
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
  // A syntax error keeps the program from being made, so a compile stops
  // only at a declaration with none; one that stopped at another still
  // leaves this declaration's errors reported.
  test("a compile stopped at another store", () => {
    const text = "store a = 1 // note\nstore b = 1 2\n";
    const all = errorsOf(newCompiler(text).compile({ textDocument: { uri: URI } } as never).program.diagnostics?.[URI] ?? [], true);
    expect(all.some((e) => e.startsWith("0:0-") && e.includes("The compile stopped")), "the compile stopped at the first store").toBe(true);
    expect(sparkdownErrors(text)).toEqual(official("local a = 1 // note\nlocal b = 1 2\n"));
    expectIncrementalEqualsCold(text);
  });
});

// The edges of a declaration's span (the round-3 repair).
describe("a declaration's span at its edges", () => {
  // A value the tree reads on across lines, in brackets.
  for (const text of ["store t = {1,\n  2 3}\n", "store t = {1,\n  2} 3\n"]) {
    test(`multi-line ${JSON.stringify(text)}`, () => {
      const expected = official(text.replace(/^store/, "local"));
      expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
      expect(sparkdownErrors(text)).toEqual(expected);
      expect(sparkdownErrors(`${text}${SCENE}`)).toEqual(expected);
      expectIncrementalEqualsCold(`${text}${SCENE}`);
    });
  }
  // The Luau's second line is indented as the scene's is, so only its first
  // line moves right.
  test('multi-line "local t = {1,\\n    2} 3" in a scene', () => {
    const text = "scene start\n  local t = {1,\n    2} 3\n  Hello.\nend\n";
    const expected = official("local t = {1,\n    2} 3\n", 1, 2);
    expect(expected.length, "the official parser reports the form").toBeGreaterThan(0);
    expect(sparkdownErrors(text)).toEqual(expected);
    expectIncrementalEqualsCold(text);
  });
  // Indented deeper than a scene's body.
  for (const line of ["local a,, = 1", "local a = 1 2", "local s = 1 g(x"]) {
    test(`${JSON.stringify(line)} indented four in a scene`, () => {
      const text = `scene start\n    ${line}\n  Hello.\nend\n`;
      expect(sparkdownErrors(text)).toEqual(official(`${line}\n`, 1, 4));
      expectIncrementalEqualsCold(text);
    });
  }
  // After another statement on its line.
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
  // An error at the very end of the span, the story's end of input.
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
  // A report of Sparkdown's own at the span's end is that error's one report.
  test("a store's value missing at its line's end is reported once", () => {
    expect(sparkdownErrors(`store a = 1,\n${SCENE}`)).toEqual(["0:11-0:12 Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("a story store whose run-on value leaves a call open to its line's end (I-1477)", () => {
  for (const line of ["local s = 1 g(x", "local s = 1 g(", "local s = 1 g(x, y", "local s = 1 g(x -- note"]) pinLine(line);
});

// A story store or local whose own value leaves a bracket open to the end of
// its line names the opener by line, as Luau, whose end of input is on the
// next line, does (I-1490). In a scene the value ends at its line too, and
// the story line after it is not read on into (I-1532). A store's comment
// after the value moves its range (I-1533).
describe("a story store or local whose value leaves a bracket open to its line's end (I-1490, I-1532)", () => {
  for (const value of ["g(x", "{1", "(1", "g(x, y", "{1, 2"]) pinLine(`local s = ${value}`);
  pinLine("local s = (1 -- note", { topLevel: false });
  // A bracket the line goes on past keeps naming its opener by column.
  for (const line of ["local s = g(x y)", "local s = {1 2}"]) pinLine(line);
});

/** Pins a document's errors, cold and incremental, to the official parser's for `luau` moved down `line` lines and right `shift` characters. */
function pinText(name: string, text: string, luau: string, line: number, shift: number): void {
  test(name, () => {
    expect(sparkdownErrors(text)).toEqual(official(luau, line, shift));
    expectIncrementalEqualsCold(text);
  });
}

// A bracket a story declaration never closes carried nothing on: its value
// ends at the end of the outermost unclosed opener's line, and the story
// lines the tree reads into the bracket after it are not read as its Luau
// (I-1532). A bracket closed on a later line still carries the value on.
describe("a story store or local whose unclosed bracket the tree reads on into story lines (I-1532)", () => {
  /**
   * Pins a line, in its `local` spelling or an assignment, before story
   * lines in a scene and (spelled `store` if a declaration) at the top level
   * before a scene. `after` holds the story lines, unindented.
   */
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
  // The story lines after the bracket, however they read, are story: one
  // with no trailing dot, one that looks like dangling or unfinished Luau,
  // and two or more of them.
  const stories = [["Hello there"], ["Hello:"], ["a.b("], ["Hello.", "Goodbye."], ["Hello there", "a.b(", "Goodbye"]];
  for (const lines of stories) {
    for (const line of ["local s = g(x", "local s = {1"]) pinBefore(line, lines, `before ${JSON.stringify(lines.join(" / "))}`);
  }
  // A function the unclosed bracket's line opens ends with that line too: its
  // body on the story lines after it is story, so its `end` is missing there.
  const functionLines = ["local s = g(function()", "local s = g(function() if x then", "local s = {function()", "s = g(function()"];
  // A block the function opens on that line, missing what Luau expects next.
  for (const block of ["while x", "if x", "for i = 1, 2", "for k in t", "repeat", "while x do", "return", "return {1", "return g(", "do", "if x then else", "for i = 1, 2 do"]) {
    functionLines.push(`local s = g(function() ${block}`, `s = g(function() ${block}`);
  }
  for (const line of functionLines) {
    pinBefore(line, ["return 1", "end", "Hello."], "before its body");
    // With only story after it, no `end` in the tree closes what it opens.
    pinBefore(line, ["Hello."], "before a story line");
  }
  pinLine("local s = g(function() return 1 end");
  // What a check of Sparkdown's own reads after a construct that begins on
  // the cut line is the story after it, not the construct's Luau: a dangling
  // `.`, an unfinished condition, an if expression and an empty assignment.
  for (const value of ["g(x.", "g(function() local a =", "g(function() return if x then 1", "g(function() if x and", "g(function() if x then elseif y and", "g(if x", "g(if x then 1"]) {
    for (const keyword of ["local s", "s"]) pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
  }
  // A string's own error in the bracket is reported once, and a string the
  // line continues with `\` is read up to the line's end, as Luau reads the
  // line alone; the braces of a string are not brackets.
  for (const keyword of ["local s", "s"]) {
    pinBefore(`${keyword} = g(\`a {} b\``, ["Hello."], "before a story line");
    for (const quote of ['"', "'", "`"]) {
      pinBefore(`${keyword} = g(${quote}abc\\`, [`continued${quote}`, "Hello."], "continued on a story line");
    }
  }
  // A function the bracket opens whose line ends with a comment, where the
  // tree closes the function with the scene's `end`: the flow's closer
  // stands after the cut, so the reading meets its end of input first.
  for (const keyword of ["local s", "s"]) {
    for (const value of ["g(function() return -- note", "g(function() return 1 -- note", "g(function() return 1 --[[note]]", "g(function() return 1; -- note"]) {
      pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
    }
  }
  // Round 4: an unfinished `\u{` escape, whose brace the tree reads as a
  // double-quoted string's interpolation; a list a function in the bracket
  // leaves open; and a string continued with `\z`, which skips the line
  // break, read as Luau reads the line alone.
  for (const keyword of ["local s", "s"]) {
    for (const value of ['g("abc\\u{', "g(function() a,", "g(function() local a,"]) {
      pinBefore(`${keyword} = ${value}`, ["Hello."], "before a story line");
    }
    for (const quote of ['"', "'"]) {
      pinBefore(`${keyword} = g(${quote}abc\\z`, [`continued${quote}`, "Hello."], "continued on a story line");
    }
    // An alternator's arms on the story lines after the cut are story: the
    // errors are those of the same line with no story after it.
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
  // The outermost unclosed opener's line ends the value, even where a bracket inside it closes on a later line.
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
