import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic, type LuauDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";
import { inPositionOrder } from "../compiler/officialSyntax";

const TYPE_ERROR = /^Expected type, got |, got '::'$|^Expected identifier when parsing (?:variable name|table field), got ':'$/;

function luauSyntaxErrors(diagnostics: LuauDiagnostic[]): string[] {
  return inPositionOrder(
    diagnostics
      .filter((d) => d.code === "SyntaxError")
      .map((d) => (TYPE_ERROR.test(d.message) && (d.endLine > d.line + 1 || (d.endLine === d.line + 1 && d.endColumn > 0)) ? { ...d, endLine: d.line + 1, endColumn: 0 } : d))
      .map(describeDiagnostic),
  );
}

function luauTypeErrors(diagnostics: LuauDiagnostic[]): string[] {
  return luauSyntaxErrors(diagnostics.filter((d) => TYPE_ERROR.test(d.message)));
}

function documentErrors(source: string): string[] {
  return diagnoseDetailed(`${source}\n`)
    .filter((d) => d.code !== "LocalUnused")
    .map((d) => `${d.range!.start.line}:${d.range!.start.character}-${d.range!.end.line}:${d.range!.end.character} ${d.message}`);
}

const POSITIONS: { name: string; template: string; followers: string[]; nothingIsValid?: true }[] = [
  { name: "local target", template: "local x: T F", followers: ["= 1", ", y = 1, 2", ";", "\nlocal z = 1", "", "-- note\nlocal z = 1", "--[[c]] = 1"] },
  { name: "local target continued", template: "local a,\n  b: T F", followers: ["= 1, 2", "\nlocal z = 1", ""] },
  { name: "numeric for variable", template: "for i: T F", followers: ["= 1, 3 do end"] },
  { name: "generic for variable", template: "for k: T F", followers: ["in pairs({}) do end", ", v in pairs({}) do end"] },
  { name: "last generic for variable", template: "for k, v: T F", followers: ["in pairs({}) do end"] },
  { name: "parameter", template: "function f(a: T F", followers: [") end", ", b) end"] },
  { name: "return type", template: "function f(): T F", followers: ["end", "\n  return 1\nend"] },
  { name: "type alias", template: "type A = T F", followers: ["", ";", "\nlocal z = 1"] },
  { name: "union operand", template: "local x: number | T F", followers: ["= 1", ";", ""] },
  { name: "union operand in parentheses", template: "local f: (number | T F", followers: [") -> nil = nil"] },
  { name: "union operand in a table", template: "local t: { a: number | T F", followers: ["} = nil"] },
  { name: "union operand in generics", template: "type B<U> = U\nlocal a: B<number | T F", followers: ["> = nil"] },
  { name: "intersection operand", template: "local g: (number & T F", followers: [") -> nil = nil"] },
  { name: "function type result", template: "local f: (number) -> T F", followers: ["= nil", ";", ""] },
  { name: "function type result pack", template: "local h: () -> (number | T F", followers: [") = nil"] },
  { name: "generic argument", template: "type B<U> = U\nlocal a: B<T F", followers: ["> = nil"], nothingIsValid: true },
  { name: "second generic argument", template: "type B<U, V> = U\nlocal a: B<number, T F", followers: ["> = nil"] },
  { name: "table field", template: "local t: { a: T F", followers: ["} = nil", ", b: number } = nil"] },
  { name: "table indexer", template: "local t: { [string]: T F", followers: ["} = nil"] },
];

const SHAPES: { name: string; type: string; valid?: true }[] = [
  { name: "nothing", type: "" },
  { name: "a trailing |", type: "number |" },
  { name: "a trailing &", type: "number &" },
  { name: "a trailing ->", type: "(number) ->" },
  { name: "a stray ?", type: "?" },
  { name: "a ? before its type", type: "?number" },
  { name: "a second :", type: ": number" },
  { name: "a ::", type: ":: number" },
  { name: "a type", type: "number", valid: true },
];

const tidy = (source: string) => `${source.replace(/(?<=\S) {2,}/g, " ").replace(/ +(?=\n|$)/g, "")}\n`;

const cases: { position: string; shape: string; source: string; valid: boolean }[] = [];
for (const { name, template, followers, nothingIsValid } of POSITIONS) {
  for (const follower of followers) {
    for (const shape of SHAPES) {
      const source = tidy(template.replace("T", shape.type).replace("F", follower));
      const valid = !!shape.valid || (!!nothingIsValid && shape.type === "");
      cases.push({ position: name, shape: shape.name, source, valid });
    }
    if (template.includes(": T")) {
      for (const colon of [" :: number", " --[[c]] :: number", " : : number"]) {
        cases.push({ position: name, shape: `\`${colon.trim()}\` for its \`:\``, source: tidy(template.replace(": T", colon).replace("F", follower)), valid: false });
      }
    }
    const named = /\w+: T/;
    if (named.test(template)) {
      for (const colon of [": number", ":: number"]) {
        cases.push({ position: name, shape: `\`${colon}\` with no name`, source: tidy(template.replace(named, colon).replace("F", follower)), valid: false });
      }
    }
  }
}

describe("a malformed type at every position", () => {
  test.each(cases.filter((c) => !c.valid).map((c) => [c.position, c.shape, c.source] as const))(
    "%s with %s: %j reports Luau's errors",
    (_position, _shape, source) => {
      const result = checkLuau(source);
      expect(luauTypeErrors(result.diagnostics).length).toBeGreaterThan(0);
      expect(inPositionOrder(result.syntaxDiagnostics.map(describeDiagnostic))).toEqual(luauSyntaxErrors(result.diagnostics));
    },
  );

  test.each(cases.filter((c) => c.valid).map((c) => [c.position, c.shape, c.source] as const))(
    "%s with %s: %j is unaffected",
    (_position, _shape, source) => {
      const result = checkLuau(source);
      expect(luauTypeErrors(result.diagnostics)).toEqual([]);
      expect(result.syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
    },
  );
});

describe("the reported layouts", () => {
  test.each([
    ["local w:\nlocal z = 1", "0:8-1:0 SyntaxError: Expected type, got 'local'"],
    ["function g()\n  local w:\nend", "1:10-2:0 SyntaxError: Expected type, got 'end'"],
    ["local w:", "0:8-1:0 SyntaxError: Expected type, got <eof>"],
    ["function g():\n  return 1\nend", "0:13-1:0 SyntaxError: Expected type, got 'return'"],
    ["function g(a: number): end", "0:22-0:26 SyntaxError: Expected type, got 'end'"],
    ["function g(): = nil end", "0:13-0:15 SyntaxError: Expected type, got '='"],
    ["for k: in pairs({}) do end", "0:6-0:9 SyntaxError: Expected type, got 'in'"],
    ["for k, v: in pairs({}) do end", "0:9-0:12 SyntaxError: Expected type, got 'in'"],
    ["local a,\n  b :: number", "1:4-1:6 SyntaxError: Expected identifier when parsing expression, got '::'"],
    ["local :: number", "0:6-0:8 SyntaxError: Expected identifier when parsing variable name, got '::'"],
    ["local : number", "0:6-0:7 SyntaxError: Expected identifier when parsing variable name, got ':'"],
    ["local a, : number", "0:9-0:10 SyntaxError: Expected identifier when parsing variable name, got ':'"],
    ["local c : : number", "0:9-0:11 SyntaxError: Expected type, got ':'"],
    ["local c: : number", "0:8-0:10 SyntaxError: Expected type, got ':'"],
    ["local t: { a: number | } = nil", "0:22-0:24 SyntaxError: Expected type, got '}'"],
    ["local f: (number |) -> nil = nil", "0:18-0:19 SyntaxError: Expected type, got ')'"],
    ["type A<T> = T\nlocal a: A<number |> = nil", "1:19-1:20 SyntaxError: Expected type, got '>'"],
    ["local g: (number &) -> nil = nil", "0:18-0:19 SyntaxError: Expected type, got ')'"],
    ["local h: () -> (number |) = nil", "0:24-0:25 SyntaxError: Expected type, got ')'"],
    ["function f(a: ) end", "0:13-0:15 SyntaxError: Expected type, got ')'"],
    ["function f(a --[[c]] :: number) end", "0:21-0:23 SyntaxError: Expected ')' (to close '(' at column 11), got '::'"],
    ["local t: { a --[[c]] :: number } = nil", "0:21-0:23 SyntaxError: Expected '}' (to close '{' at column 10), got '::'"],
    ["function f() --[[c]] :: number end", "0:21-0:23 SyntaxError: Expected identifier when parsing expression, got '::'"],
    ["for k --[[c]] :: number in pairs({}) do end", "0:14-0:16 SyntaxError: Expected 'in' when parsing for loop, got '::'"],
    ["local t: { a: number, : string } = nil", "0:22-0:23 SyntaxError: Expected identifier when parsing table field, got ':'"],
    ["local t: { a: number, :: string } = nil", "0:22-0:24 SyntaxError: Expected identifier when parsing table field, got '::'"],
  ])("%j reports %j and the errors of Luau's recovery", (source, message) => {
    const result = checkLuau(`${source}\n`);
    const errors = result.syntaxDiagnostics.map(describeDiagnostic);
    expect(errors).toContain(message);
    expect(inPositionOrder(errors)).toEqual(luauSyntaxErrors(result.diagnostics));
  });

  test.each([
    "local x: number = 1",
    "for k, v: number in pairs({a = 1}) do end",
    "for k: number | string, v: string? in pairs({}) do end",
    "for i: number = 1, 3 do end",
    "local t: { a: number | string } = { a = 1 }",
    "local z:\n  number = 1",
    "local m: number |\n  string = 1",
    "function g():\n  number\n  return 1\nend",
    "local t = {m = function(self) return {} end}\nfor k in t:m() do end",
    "function cut_to(escape: ->) end",
    "::top::\nlocal x = 1",
  ])("%j is unaffected", (source) => {
    expect(checkLuau(`${source}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  test.each([
    ["scene s\n  local x: --[[c]]\n  Story.\nend", ["1:10-2:0 Expected type, got <eof>"]],
    ["scene s\n  local x:\nend", ["1:10-2:0 Expected type, got <eof>"]],
    ["scene s\n  local x --[[c]] :: number\nend", ["1:18-1:20 Expected identifier when parsing expression, got '::'", "1:21-1:27 Incomplete statement: expected assignment or a function call"]],
    ["store x: = 1", ["0:8-0:10 Expected type, got '='"]],
    ["store x:", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x:\nStory.", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x: -- note\nStory.", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x:\nstore y = 1", ["0:8-1:0 Expected type, got <eof>"]],
    ["scene s\n  store x:\nend", ["1:2-1:10 store declaration must be at the top level; assign it here with & name = value instead", "1:10-2:0 Expected type, got <eof>"]],
    ["scene s(a: )\nend", ["0:10-0:12 Expected type, got ')'"]],
    ["scene s(a: --[[c]] ?)\nend", ["0:10-0:20 Expected type, got '?'"]],
    ["scene s(: number)\nend", ["0:8-0:9 Expected identifier when parsing variable name, got ':'"]],
    ["scene s(a, :: number)\nend", ["0:11-0:13 Expected identifier when parsing variable name, got '::'"]],
    ["scene s(a :: number)\nend", ["0:10-0:12 Expected ')' (to close '(' at column 8), got '::'"]],
    ["scene s(a --[[c]] :: number)\nend", ["0:18-0:20 Expected ')' (to close '(' at column 8), got '::'"]],
    ['scene s\n  local marker = "--[["\n  local x --[[c]] :: number\nend', ["2:18-2:20 Expected identifier when parsing expression, got '::'", "2:21-2:27 Incomplete statement: expected assignment or a function call"]],
    ["scene s\n  -- --[[\n  local x --[[real]] :: number\nend", ["2:21-2:23 Expected identifier when parsing expression, got '::'", "2:24-2:30 Incomplete statement: expected assignment or a function call"]],
    ["store x: --[[ unfinished\nlocal y = 1", ["0:9-2:0 Expected identifier when parsing expression, got unfinished comment"]],
    ["scene s(a: 123)\nend", ["0:10-0:14 Expected type, got '123'"]],
    ["scene s(a: ..)\nend", ["0:10-0:13 Expected type, got '..'"]],
  ])("in a Sparkdown document, %j reports %j", (source, messages) => {
    expect(documentErrors(source)).toEqual(messages);
  });

  const long = "x".repeat(5000);
  test.each([
    ["a local target", `scene s\n  local x --[[${long}]] :: number\nend`, ["1:5017-1:5019 Expected identifier when parsing expression, got '::'", "1:5020-1:5026 Incomplete statement: expected assignment or a function call"]],
    ["a store declaration", `store x: --[[${long}]] = 1`, ["0:8-0:5017 Expected type, got '='"]],
  ])("in a Sparkdown document, a long comment in %s", (_position, source, messages) => {
    expect(documentErrors(source)).toEqual(messages);
  });
  test.each([
    ["a parameter", `function f(a --[[${long}]] :: number) end`],
    ["a parameter, with a leveled comment", `function f(a --[==[${long}]==] :: number) end`],
    ["a table field", `local t: { a --[[${long}]] :: number } = nil`],
    ["a parameter, with an opener in the comment's text", "function f(a --[[ ( --[[ ]] :: number) end"],
    ["a local target, after an opener in a string", 'local marker = "--[["\nlocal x --[[c]] :: number'],
    ["a local target, after an opener in a line comment", "-- --[[\nlocal x --[[real]] :: number"],
    ["a local target, with a comment of a high level", `local x --[${"=".repeat(70)}[c]${"=".repeat(70)}] :: number`],
    ["a parameter, after two comments", "function f(a --[[x]] --[[y]] :: number) end"],
  ])("a long comment before `::` in %s reports Luau's errors", (_position, source) => {
    const result = checkLuau(`${source}\n`);
    expect(luauTypeErrors(result.diagnostics).length).toBeGreaterThan(0);
    expect(inPositionOrder(result.syntaxDiagnostics.map(describeDiagnostic))).toEqual(luauSyntaxErrors(result.diagnostics));
  });

  test("an annotated loop variable is bound", () => {
    const tree = parseSource("function f(t)\n  for k: number | string, v: number in pairs(t) do end\nend\n");
    const targets: string[] = [];
    tree.iterate({
      enter: (node) => {
        if (node.name !== "LuauForCondition_content") return;
        for (let child = node.node.firstChild; child; child = child.nextSibling) {
          if (child.name === "LuauInKeyword") break;
          targets.push(child.name);
        }
        return false;
      },
    });
    expect(targets).toEqual([
      "LuauAccessPath",
      "LuauTypeAnnotationOperation",
      "LuauCommaSeparator",
      "LuauAccessPath",
      "LuauTypeAnnotationOperation",
      "RequiredWhitespace",
    ]);
  });

  test.each([
    "function f(t)\n  for k, v in pairs({}), t:m() do end\nend\n",
    "function f(t)\n  for k, v in pairs({}), t:m --[[c]] () do end\nend\n",
    "function f(t)\n  for k in iter(1, t:m --[[c]] ()) do end\nend\n",
  ])("%j reads no annotation", (source) => {
    const annotations: string[] = [];
    parseSource(source).iterate({
      enter: (node) => {
        if (node.name === "LuauTypeAnnotationOperation") annotations.push(source.slice(node.from, node.to));
      },
    });
    expect(annotations).toEqual([]);
  });
});
