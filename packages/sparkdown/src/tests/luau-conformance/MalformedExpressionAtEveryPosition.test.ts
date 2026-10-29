import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { inPositionOrder, officialErrorList, officialSyntaxErrors } from "../compiler/officialSyntax";
import { diagnosticMessage } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic } from "./typecheckTestHarness";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { functionSpans } from "../programListing";

function luauFirstError(source: string): string[] {
  const error = officialSyntaxErrors(source)[0];
  if (!error) return [];
  const { begin, end } = error.location;
  return [`${begin.line}:${begin.column}-${end.line}:${end.column} ${error.message}`];
}

const SPARKDOWN_ONLY = /\n> |^A variable must be initialized/;

function expectLuauReports(source: string, messages: readonly string[]) {
  const luau = officialSyntaxErrors(source.replace(/\bstore /g, "local ")).map(
    ({ location: { begin, end }, message }) => `${begin.line}:${begin.column}-${end.line}:${end.column} ${message}`,
  );
  for (const message of messages) {
    if (!SPARKDOWN_ONLY.test(message.slice(message.indexOf(" ") + 1))) expect(luau).toContain(message);
  }
}

function expectReports(source: string, errors: readonly string[], messages: readonly string[]) {
  const header = source.split("\n", 1)[0]!;
  const luauOnly = /^function \w+\(/.test(header) && !messages.some((m) => SPARKDOWN_ONLY.test(m.slice(m.indexOf(" ") + 1)));
  if (!luauOnly) {
    expect(errors).toEqual(messages);
    return;
  }
  expect(errors).toEqual(expect.arrayContaining([...messages]));
  expect(inPositionOrder(errors)).toEqual(officialErrorList(`${source}\n`));
}

const URI = "inmemory:///main.sd";

function compileDocument(text: string) {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  });
  const program = compiler.compile({ textDocument: { uri: URI } }).program;
  const errors = (program.diagnostics?.[URI] ?? [])
    .filter((d) => d.severity === 1)
    .sort((a, b) => a.range!.start.line - b.range!.start.line || a.range!.start.character - b.range!.start.character)
    .map((d) => `${d.range!.start.line}:${d.range!.start.character}-${d.range!.end.line}:${d.range!.end.character} ${diagnosticMessage(d)}`);
  return { errors, functions: program.chunks ? functionSpans(program) : withoutChunks(text, errors) };
}

function withoutChunks(text: string, errors: readonly string[]): null {
  const loopTest = /(^|\n) *(while|until|repeat)\b|\buntil\b/.test(text);
  const malformedStore = /(^|\n) *store /.test(text);
  expect(loopTest || malformedStore, `the compile builds no chunks: ${JSON.stringify(text)}`).toBe(true);
  expect(errors.length, `no error for ${JSON.stringify(text)}`).toBeGreaterThan(0);
  return null;
}

function expectSpans(functions: ReturnType<typeof functionSpans> | null, expected: unknown) {
  if (functions !== null) expect(functions).toEqual(expected);
}

const POSITIONS: { name: string; template: string; followers: string[] }[] = [
  { name: "local value", template: "local y = E F", followers: ["\nlocal z = 2", "", ";", "-- note", "\nuntil"] },
  { name: "reassigned value", template: "y = E F", followers: ["\nlocal z = 2", "", ";"] },
  { name: "second local value", template: "local a, b = 1, E F", followers: ["\nlocal z = 2", "", ";"] },
  { name: "second reassigned value", template: "a, b = 1, E F", followers: ["\nlocal z = 2", ""] },
  { name: "return value", template: "return E F", followers: ["", ";"] },
  { name: "call argument", template: "print(E F", followers: [")"] },
  { name: "second call argument", template: "print(1, E F", followers: [")"] },
  { name: "parenthesized value", template: "local y = (E F", followers: [")"] },
  { name: "index", template: "local y = t[E F", followers: ["]"] },
  { name: "table field", template: "local y = { a = E F", followers: ["}", ", b = 2 }"] },
  { name: "if condition", template: "if E F", followers: ["then end"] },
  { name: "while condition", template: "while E F", followers: ["do end"] },
  { name: "statement", template: "E F", followers: ["\nlocal z = 2", "", ";"] },
];

const SHAPES: { name: string; expression: string; valid?: true }[] = [
  { name: "nothing", expression: "" },
  { name: "a trailing +", expression: "1 +" },
  { name: "a trailing and", expression: "1 and" },
  { name: "a trailing ..", expression: "'a' .." },
  { name: "a trailing ==", expression: "1 ==" },
  { name: "a lone not", expression: "not" },
  { name: "a lone -", expression: "-" },
  { name: "a dangling .", expression: "t.a." },
  { name: "a dangling . after a parenthesized value", expression: "(t).a." },
  { name: "a dangling . after a call", expression: "get().a." },
  { name: "a dangling . after an index", expression: "t[1].a." },
  { name: "a dangling . after a comment", expression: "--[[c]] t.a." },
  { name: "a dangling :", expression: "t:" },
  { name: "a named function", expression: "function named() end" },
  { name: "a value", expression: "1 + 2", valid: true },
  { name: "a member", expression: "t.a", valid: true },
  { name: "a function", expression: "function() end", valid: true },
];

const tidy = (source: string) => source.replace(/(?<=\S) {2,}/g, " ").replace(/ +(?=\n|$)/g, "");

const cases: { position: string; shape: string; body: string }[] = [];
for (const { name, template, followers } of POSITIONS) {
  for (const follower of followers) {
    for (const shape of SHAPES) {
      if (name === "statement" && shape.expression === "-") continue;
      let body = tidy(template.replace("E", shape.expression).replace("F", follower));
      if (follower === "\nuntil") body = `repeat\n${body} true`;
      cases.push({ position: name, shape: shape.name, body });
    }
  }
}

describe("a malformed expression at every position", () => {
  test.each(cases.map((c) => [c.position, c.shape, c.body] as const))(
    "%s with %s: %j in a function reports Luau's errors",
    (_position, _shape, body) => {
      const lines = ["function f(t, get)", ...body.split("\n").map((line) => `  ${line}`), "end", ""];
      const text = lines.join("\n");
      const { errors, functions } = compileDocument(text);
      expect(inPositionOrder(errors)).toEqual(officialErrorList(text));
      expectSpans(functions, [{ path: "f", lines: [0, 0, lines.length - 2] }]);
    },
  );

  test.each(cases.map((c) => [c.position, c.shape, c.body] as const))(
    "%s with %s: %j in a Luau file reports Luau's errors",
    (_position, _shape, body) => {
      const source = `local t, get, a, b, y\n${body}\n`;
      const luau = officialErrorList(source, { luauFile: true }).map((d) => d.replace(/^(\S+) /, "$1 SyntaxError: "));
      expect(inPositionOrder(checkLuau(source, { mode: "nonstrict" }).syntaxDiagnostics.map(describeDiagnostic))).toEqual(luau);
    },
  );
});

describe("the reported layouts", () => {
  test.each([
    ["x = 1 +", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["local y = 1 +\n  local z = 2", ["2:2-2:7 Expected identifier when parsing expression, got 'local'"]],
    ["local y = 1 +;", ["1:15-1:16 Expected identifier when parsing expression, got ';'"]],
    ["repeat\n    local y = 1 +\n  until true", ["3:2-3:7 Expected identifier when parsing expression, got 'until'"]],
    ["local y = not\n  return y", ["2:2-2:8 Expected identifier when parsing expression, got 'return'"]],
    ["2", ["1:2-1:3 Expected identifier when parsing expression, got '2'"]],
    ["x + 1", ["1:2-1:3 Incomplete statement: expected assignment or a function call"]],
    ["local a, b = 1\n    2", ["2:4-2:5 Expected identifier when parsing expression, got '2'"]],
    ["local a, g = 1, function named() return 7 end", ["1:27-1:32 Expected '(' when parsing function, got 'named'"]],
    ["a, g = 1, function named() return 7 end", ["1:21-1:26 Expected '(' when parsing function, got 'named'"]],
  ])("%j in a function reports Luau's errors, %j among them", (body, messages) => {
    const text = `function f(t)\n  ${body}\nend\n`;
    const { errors, functions } = compileDocument(text);
    expect(errors).toEqual(expect.arrayContaining(messages));
    expect(inPositionOrder(errors)).toEqual(officialErrorList(text));
    expectSpans(functions, [{ path: "f", lines: [0, 0, text.split("\n").length - 2] }]);
  });

  test.each([
    ["a parenthesized receiver", ["local y = (t).a."], 4],
    ["a call result receiver", ["local y = get().a."], 4],
    ["a numeric indexer receiver", ["local y = t[1].a."], 4],
    ["a string indexer receiver", ['local y = t["a"].'], 4],
    ["a block comment before the receiver", ["local y = --[[note]]t.a."], 4],
    ["a continuation line", ["local y = t", "  .a."], 5],
    ["a continuation line holding only the `.`", ["local y = t -- receiver", "  ."], 5],
    ["a line holding only the `.` at the statement's indent", ["local y = t", "."], 5],
    ["a reassignment target", ["t.a. = 1"], 4],
  ])("#1156: %s", (_name, body, endLine) => {
    const lines = ["function f(t, get)", "  local z = 0", ...body.map((line) => `  ${line}`), "  return 1", "end", ""];
    const text = lines.join("\n");
    const { errors, functions } = compileDocument(text);
    expect(errors).toEqual(expect.arrayContaining(luauFirstError(text)));
    expect(inPositionOrder(errors)).toEqual(officialErrorList(text));
    expectSpans(functions, [{ path: "f", lines: [0, 0, endLine] }]);
  });

  test.each([
    "local y = 1 +\n  2",
    "local y = 1 *\n  print(y)",
    "local y = 1 ==\n  nil",
    "local y = true and\n  not false",
    "local y = 1 +\n  if true then 1 else 2",
    "local f = nil or\n  function() end",
    "local y = 1 <= 2",
    "local y = 1 >= 2",
    "local y = 1 ~= 2",
    "y = 1\n  y += 2",
    "local y = t.a.--[[c]]b",
    'local y = (t).a .. "x"',
    'local y = t.a.."x"',
    "print(t.a)",
    "local g = function() end",
  ])("%j in a function is unaffected", (body) => {
    const text = `function f(t)\n  ${body}\n  return 1\nend\n`;
    expect(luauFirstError(text)).toEqual([]);
    expect(compileDocument(text).errors).toEqual([]);
  });

  test.each([
    ["-> s\nscene s\n  local a = ;\n  Hello.\nend", ["2:12-2:13 Expected identifier when parsing expression, got ';'"]],
    ["-> s\nscene s\n  local a = 1 +;\n  Hello.\nend", ["2:15-2:16 Expected identifier when parsing expression, got ';'"]],
    ["-> s\nscene s\n  local a, b = 1, ;\n  Hello.\nend", ["2:16-2:17 Expected identifier when parsing expression, got ';'"]],
    ["-> s\nscene s\n  local a = ;\nend", ["2:12-2:13 Expected identifier when parsing expression, got ';'"]],
    ["function f   \n  local a = ;\nend", ["1:12-1:13 Expected identifier when parsing expression, got ';'"]],
    ["function f()\n  local a = 1 +; local b = 2 +;\nend", [
      "1:15-1:16 Expected identifier when parsing expression, got ';'",
      "1:30-1:31 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  local a = t.\n  b; local z = 1 +;\nend", [
      "1:13-1:14 Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      "2:18-2:19 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f()\n  local a = if then 1 else 2\nend", ["1:15-1:19 Expected identifier when parsing expression, got 'then'"]],
    ["function f(c)\n  local a = if c then 1 elseif then 2 else 3\n  return a\nend", ["1:31-1:35 Expected identifier when parsing expression, got 'then'"]],
    ["-> s\nscene s\n  local x = t:m\n  Hello.\nend", ["2:12-3:0 Expected '(', '{' or <string> when parsing function call, got <eof>"]],
    ["function f()\n  local x = 0xZ\n  2\nend", ["1:12-1:15 Malformed number", "2:2-2:3 Expected identifier when parsing expression, got '2'"]],
    ["function f()\n  local x = 1 +\n  local y = 1 +;\nend", [
      "2:2-2:7 Expected identifier when parsing expression, got 'local'",
      "2:15-2:16 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f()\n  local a = 1 + local b = 2 +;\nend", [
      "1:16-1:21 Expected identifier when parsing expression, got 'local'",
      "1:29-1:30 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f()\n  while 1 + do\n    x = 2 +;\n  end\nend", [
      "1:12-1:14 Expected identifier when parsing expression, got 'do'",
      "2:11-2:12 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f()\n  x + 1\n  local y = 2 +;\nend", [
      "1:2-1:3 Incomplete statement: expected assignment or a function call",
      "2:15-2:16 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f()\n  local x: {\n    bar\n    baz\n  } = {}\n  2\nend", ["3:4-3:7 Expected '}' (to close '{' at line 2), got 'baz'", "5:2-5:3 Expected identifier when parsing expression, got '2'"]],
    ["function f()\n  local x: {\n    bar\n    baz\n    qux\n  } = {}\n  2\nend", ["3:4-3:7 Expected '}' (to close '{' at line 2), got 'baz'", "6:2-6:3 Expected identifier when parsing expression, got '2'"]],
    ["function f(t)\n  local a = t.\n  b local z = 1 +;\nend", [
      "1:13-1:14 Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      "2:17-2:18 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  local a = t.\n  b z = 1 +;\nend", [
      "1:13-1:14 Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line",
      "2:11-2:12 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  print(1 + local y = 2)\nend", ["1:12-1:17 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  local a = (1 + local y = 2)\nend", ["1:17-1:22 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  local a = {1 + local y = 2}\nend", ["1:17-1:22 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  local a = t[1 + local y = 2]\nend", ["1:18-1:23 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  local a = {1; local y}\nend", ["1:16-1:21 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  t.a.; x = 1 +;\nend", ["1:6-1:7 Expected identifier, got ';'", "1:15-1:16 Expected identifier when parsing expression, got ';'"]],
    ["function f(t)\n  print((1 + local y = 2)\n  )\nend", ["1:13-1:18 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  print({1 + local y = 2}\n  )\nend", ["1:13-1:18 Expected identifier when parsing expression, got 'local'"]],
    ["function f(t)\n  local g = function named() 2 end\nend", [
      "1:21-1:26 Expected '(' when parsing function, got 'named'",
      "1:29-1:30 Expected identifier when parsing expression, got '2'",
    ]],
    ["function f(t)\n  if 1 + then x + 1 end\nend", [
      "1:9-1:13 Expected identifier when parsing expression, got 'then'",
      "1:14-1:15 Incomplete statement: expected assignment or a function call",
    ]],
    ["function f(t)\n  while 1 + do x + 1 end\nend", [
      "1:12-1:14 Expected identifier when parsing expression, got 'do'",
      "1:15-1:16 Incomplete statement: expected assignment or a function call",
    ]],
    ["function f(t)\n  print(1, ) 1 +\nend", [
      "1:11-1:12 Expected expression after ',' but got ')' instead",
      "1:13-1:14 Expected identifier when parsing expression, got '1'",
    ]],
    ["function f(t)\n  local y = () 1 +\nend", [
      "1:13-1:14 Expected identifier when parsing expression, got ')'",
      "1:15-1:16 Expected identifier when parsing expression, got '1'",
    ]],
    ["function f(t)\n  {1 +}\nend", ["1:2-1:3 Expected identifier when parsing expression, got '{'"]],
    ["function f(t)\n  x = 1 'a' ..\nend", ["1:8-1:11 Expected identifier when parsing expression, got \"a\""]],
    ["function f(t)\n  ; 1 +\nend", [
      "1:2-1:3 Expected identifier when parsing expression, got ';'",
      "1:4-1:5 Expected identifier when parsing expression, got '1'",
    ]],
    ["function f(t)\n  local y = t.a. :: number\nend", ["1:17-1:19 Expected identifier, got '::'"]],
    ["function f(t)\n  local y = 1 + :: number\nend", ["1:16-1:18 Expected identifier when parsing expression, got '::'"]],
    ["function f(t)\n  print((1 + local y = 2)) local z = 3 +;\nend", [
      "1:13-1:18 Expected identifier when parsing expression, got 'local'",
      "1:40-1:41 Expected identifier when parsing expression, got ';'",
    ]],
  ])("%j reports %j", (source, messages) => {
    const { errors, functions } = compileDocument(`${source}\n`);
    expectReports(source, errors, messages);
    if (source.startsWith("function")) {
      expectSpans(functions, [{ path: "f", lines: [0, 0, source.split("\n").length - 1] }]);
      expectLuauReports(source, messages);
    }
  });

  test.each([
    ["function f(t)\n  t.a.return 1\nend", ["1:6-1:12 Expected identifier, got 'return'"]],
    ["function f(t)\n  t.a.--[[note]]return 1\nend", ["1:16-1:22 Expected identifier, got 'return'"]],
    ["function f(t)\n  t.a.return x = 2 +;\nend", ["1:6-1:12 Expected identifier, got 'return'", "1:20-1:21 Expected identifier when parsing expression, got ';'"]],
    ["function f(t)\n  t.a.return if 1 + then end\nend", ["1:6-1:12 Expected identifier, got 'return'", "1:20-1:24 Expected identifier when parsing expression, got 'then'"]],
    ["function f(t)\n  x + function() end\nend", [
      "1:2-1:3 Incomplete statement: expected assignment or a function call",
      "1:14-1:15 Expected identifier when parsing function name, got '('",
    ]],
    ["function f(t)\n  do y = t.a. end 1 +\nend", [
      "1:14-1:17 Expected identifier, got 'end'",
      "1:18-1:19 Expected identifier when parsing expression, got '1'",
    ]],
    ["function f(t)\n  local y = t.a. if 1 then end\nend", ["1:17-1:19 Expected identifier, got 'if'"]],
    ["function f(t)\n  repeat local y = t.a. until true\nend", ["1:24-1:29 Expected identifier, got 'until'"]],
    ["function f(t, c)\n  if c then local y = t.a. elseif c then end\nend", ["1:27-1:33 Expected identifier, got 'elseif'"]],
    ["function f(t)\n  repeat local y = t.a. until true local z = 2 +;\nend", [
      "1:24-1:29 Expected identifier, got 'until'",
      "1:48-1:49 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  local a, b = 1, t.a. if {1 +} then end\nend", [
      "1:23-1:25 Expected identifier, got 'if'",
      "1:30-1:31 Expected identifier when parsing expression, got '}'",
      "1:32-1:36 Expected identifier when parsing expression, got 'then'",
    ], false],
  ] as [string, string[], boolean?][])("recovery: %j reports %j", (source, messages, keepsEnd = true) => {
    const { errors, functions } = compileDocument(`${source}\n`);
    expectReports(source, errors, messages);
    if (keepsEnd) expectSpans(functions, [{ path: "f", lines: [0, 0, source.split("\n").length - 1] }]);
    expectLuauReports(source, messages);
  });

  test.each([
    ["function f(t)\n  print(1 + local a = 2\n  do\n    )\n    print(1 + local b = 3\n  end\n  2\n  )\nend\n", [
      "1:12-1:17 SyntaxError: Expected identifier when parsing expression, got 'local'",
      "4:14-4:19 SyntaxError: Expected identifier when parsing expression, got 'local'",
      "6:2-6:3 SyntaxError: Expected identifier when parsing expression, got '2'",
      "7:2-7:3 SyntaxError: Expected identifier when parsing expression, got ')'",
    ]],
  ])("in a Luau file, %j reports %j", (source, messages) => {
    const luauErrors = checkLuau(source, { mode: "nonstrict" })
      .syntaxDiagnostics.map(describeDiagnostic)
      .filter((d) => !d.includes("SyntaxError: Sparkdown "));
    expect(luauErrors).toEqual(expect.arrayContaining(messages));
    expect(inPositionOrder(luauErrors)).toEqual(officialErrorList(source, { luauFile: true }).map((d) => d.replace(/^(\S+) /, "$1 SyntaxError: ")));
  });

  test.each([
    ["function f\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f -- note\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f --[[c]]\n  x =\nend", ["2:0-2:3 Expected identifier when parsing expression, got 'end'"]],
    ["function f\n  local y = 1\n  return y\nend", []],
    ["function f -- note\n  local y = 1\n  return y\nend", []],
  ])("a function with no parameter list, %j, reports %j", (source, messages) => {
    expect(compileDocument(`${source}\n`).errors).toEqual(messages);
  });

  test.each([
    ["-> s\nscene s\n  local y = 1 +\n  local z = 2\nend", ["2:15-3:0 Expected identifier when parsing expression, got <eof>"]],
    ["-> s\nscene s\n  local y = 1 +\nend", ["2:15-3:0 Expected identifier when parsing expression, got <eof>"]],
    ["-> s\nscene s\n  local a, b = 1,\n  Hello there.\n  local c = 3\nend", ["2:17-3:0 Expected identifier when parsing expression, got <eof>"]],
    ["store hp = 100,\nThe hero has {hp} health.\nstore mp = 50,\nscene s\n  Hi.\nend", [
      "0:14-0:15 Expected identifier when parsing expression, got <eof>",
      "2:13-2:14 Expected identifier when parsing expression, got <eof>",
    ]],
    ["store a, b = 1,\n  2", ["0:14-0:15 Expected identifier when parsing expression, got <eof>"]],
    ["store x = 1 +;", ["0:13-0:14 Expected identifier when parsing expression, got ';'"]],
    ["store x = 1 +\nstore z = 2", ["0:13-1:0 Expected identifier when parsing expression, got <eof>"]],
    ["function f(t)\n  store x = 0xZ\n  2\nend", ["1:12-1:15 Malformed number", "2:2-2:3 Expected identifier when parsing expression, got '2'"]],
    ["function f(t)\n  store x = 0xZ --[[\n  ]] 2\nend", ["1:12-1:15 Malformed number", "2:5-2:6 Expected identifier when parsing expression, got '2'"]],
    ["function f(t)\n  store x = t.a.\n  return 1 +;\nend", [
      "1:12-1:15 A variable must be initialized to a number, string, boolean, constant, or divert target.",
      "2:2-2:8 Expected identifier, got 'return'",
      "2:12-2:13 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  store x = t.a.\n  --[[c]] return 1 +;\nend", [
      "1:12-1:15 A variable must be initialized to a number, string, boolean, constant, or divert target.",
      "2:10-2:16 Expected identifier, got 'return'",
      "2:20-2:21 Expected identifier when parsing expression, got ';'",
    ]],
    ["function f(t)\n  store x = 1 +\n  local y = 2 +;\nend", [
      "2:2-2:7 Expected identifier when parsing expression, got 'local'",
      "2:15-2:16 Expected identifier when parsing expression, got ';'",
    ]],
    ["-> s\nscene s\n  if then\n    Hi.\n  end\nend", ["2:5-2:9 Expected identifier when parsing expression, got 'then'"]],
  ])("in a Sparkdown document, %j reports %j", (source, messages) => {
    expect(compileDocument(`${source}\n`).errors).toEqual(messages);
    if (source.startsWith("function")) expectLuauReports(source, messages);
  });

  test("#1144: a value on the line after a list that lacks its comma is an error", () => {
    const ctx = makeRuntimeStoryFromSource("Value {f()}.\nfunction f()\n  local a, b = 1\n    2\n  return b\nend\n");
    expect(ctx.errorMessages).toEqual(["Expected identifier when parsing expression, got '2'"]);
  });
});
