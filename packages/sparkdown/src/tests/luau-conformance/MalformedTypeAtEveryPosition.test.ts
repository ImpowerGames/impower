import { describe, expect, test } from "vitest";
import { diagnoseDetailed } from "./diagnosticTestHarness";
import { checkLuau, describeDiagnostic, type LuauDiagnostic } from "./typecheckTestHarness";
import { parseSource } from "../compiler/grammarSnapshot";

// A type that is missing, or that cannot start with the token where one must
// stand, is one syntax error wherever a type can appear, worded and placed as
// Luau's parser reports it: from the end of the token before it to the end of
// the token Luau found instead (#1174). So is an annotation written with `::`,
// which Luau words by where it stands, and one with no name before it.

// Luau's errors for those; its other syntax errors are not type errors.
const TYPE_ERROR = /^Expected type, got |, got '::'$|^Expected identifier when parsing (?:variable name|table field), got ':'$/;

/**
 * Luau's own type errors for a snippet, one for each token it found: its
 * parser can name a token again as it recovers (`Expected type, got '::'`,
 * then `Expected ')' (to close '(' at column 11), got '::'`), and the first
 * error at the token, which begins first, is the one Sparkdown reports.
 */
function luauTypeErrors(diagnostics: LuauDiagnostic[]): string[] {
  const tokens = new Set<string>();
  return diagnostics
    .filter((d) => {
      if (d.code !== "SyntaxError" || !TYPE_ERROR.test(d.message)) return false;
      const token = `${d.endLine}:${d.endColumn}`;
      if (tokens.has(token)) return false;
      tokens.add(token);
      return true;
    })
    .map(describeDiagnostic);
}

/** A `.sd` document's errors, as `line:character-line:character message`. */
function documentErrors(source: string): string[] {
  return diagnoseDetailed(`${source}\n`)
    .filter((d) => d.code !== "LocalUnused")
    .map((d) => `${d.range!.start.line}:${d.range!.start.character}-${d.range!.end.line}:${d.range!.end.character} ${d.message}`);
}

// Every position a type can appear, with `T` where the type goes and `F`
// where what follows it goes, and what can follow it there. Luau allows
// empty type arguments (`B<>`), so there nothing is not malformed.
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

// The malformed shapes a type can take, and a valid one.
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

// A snippet as written by hand: one space between tokens where an empty
// shape leaves two, none at a line's end, and a line break at the end.
const tidy = (source: string) => `${source.replace(/(?<=\S) {2,}/g, " ").replace(/ +(?=\n|$)/g, "")}\n`;

const cases: { position: string; shape: string; source: string; valid: boolean }[] = [];
for (const { name, template, followers, nothingIsValid } of POSITIONS) {
  for (const follower of followers) {
    for (const shape of SHAPES) {
      const source = tidy(template.replace("T", shape.type).replace("F", follower));
      const valid = !!shape.valid || (!!nothingIsValid && shape.type === "");
      cases.push({ position: name, shape: shape.name, source, valid });
    }
    // The annotation's own `:` doubled, or written twice.
    if (template.includes(": T")) {
      for (const colon of [" :: number", " : : number"]) {
        cases.push({ position: name, shape: `\`${colon.trim()}\` for its \`:\``, source: tidy(template.replace(": T", colon).replace("F", follower)), valid: false });
      }
    }
    // No name before the annotation.
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
    "%s with %s: %j reports Luau's one error",
    (_position, _shape, source) => {
      const result = checkLuau(source);
      const luau = luauTypeErrors(result.diagnostics);
      expect(luau).toHaveLength(1);
      expect(result.syntaxDiagnostics.map(describeDiagnostic)).toEqual(luau);
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
    // #1152: a `:` at the end of its line, with the next line's token.
    ["local w:\nlocal z = 1", "0:8-1:5 SyntaxError: Expected type, got 'local'"],
    ["function g()\n  local w:\nend", "1:10-2:3 SyntaxError: Expected type, got 'end'"],
    ["local w:", "0:8-1:0 SyntaxError: Expected type, got <eof>"],
    ["function g():\n  return 1\nend", "0:13-1:8 SyntaxError: Expected type, got 'return'"],
    ["function g(a: number): end", "0:22-0:26 SyntaxError: Expected type, got 'end'"],
    ["function g(): = nil end", "0:13-0:15 SyntaxError: Expected type, got '='"],
    // #1164: before `in`.
    ["for k: in pairs({}) do end", "0:6-0:9 SyntaxError: Expected type, got 'in'"],
    ["for k, v: in pairs({}) do end", "0:9-0:12 SyntaxError: Expected type, got 'in'"],
    // #1166: a `::` on a target continued onto the next line.
    ["local a,\n  b :: number", "1:4-1:6 SyntaxError: Expected identifier when parsing expression, got '::'"],
    // #1167: no name before the annotation.
    ["local :: number", "0:6-0:8 SyntaxError: Expected identifier when parsing variable name, got '::'"],
    ["local : number", "0:6-0:7 SyntaxError: Expected identifier when parsing variable name, got ':'"],
    ["local a, : number", "0:9-0:10 SyntaxError: Expected identifier when parsing variable name, got ':'"],
    // #1168: two separate colons.
    ["local c : : number", "0:9-0:11 SyntaxError: Expected type, got ':'"],
    ["local c: : number", "0:8-0:10 SyntaxError: Expected type, got ':'"],
    // #1170: a trailing `|` or `&` before a closing bracket.
    ["local t: { a: number | } = nil", "0:22-0:24 SyntaxError: Expected type, got '}'"],
    ["local f: (number |) -> nil = nil", "0:18-0:19 SyntaxError: Expected type, got ')'"],
    ["type A<T> = T\nlocal a: A<number |> = nil", "1:19-1:20 SyntaxError: Expected type, got '>'"],
    ["local g: (number &) -> nil = nil", "0:18-0:19 SyntaxError: Expected type, got ')'"],
    ["local h: () -> (number |) = nil", "0:24-0:25 SyntaxError: Expected type, got ')'"],
    ["function f(a: ) end", "0:13-0:15 SyntaxError: Expected type, got ')'"],
    // A `::` after a block comment.
    ["function f(a --[[c]] :: number) end", "0:21-0:23 SyntaxError: Expected ')' (to close '(' at column 11), got '::'"],
    ["local t: { a --[[c]] :: number } = nil", "0:21-0:23 SyntaxError: Expected '}' (to close '{' at column 10), got '::'"],
    ["function f() --[[c]] :: number end", "0:21-0:23 SyntaxError: Expected identifier when parsing expression, got '::'"],
    ["for k --[[c]] :: number in pairs({}) do end", "0:14-0:16 SyntaxError: Expected 'in' when parsing for loop, got '::'"],
    // A table type's field with no name.
    ["local t: { a: number, : string } = nil", "0:22-0:23 SyntaxError: Expected identifier when parsing table field, got ':'"],
    ["local t: { a: number, :: string } = nil", "0:22-0:24 SyntaxError: Expected identifier when parsing table field, got '::'"],
  ])("%j reports %j", (source, message) => {
    expect(checkLuau(`${source}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([message]);
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
    // Sparkdown's divert-target type and a label, which Luau's parser rejects.
    "function cut_to(escape: ->) end",
    "::top::\nlocal x = 1",
  ])("%j is unaffected", (source) => {
    expect(checkLuau(`${source}\n`).syntaxDiagnostics.map(describeDiagnostic)).toEqual([]);
  });

  // In a narrative body a declaration ends at its line, so a target on the
  // line after a comma is story (`LocalAnnotationColons.test.ts`).

  // In a Sparkdown document the checker reads its Luau statements with the
  // rest left out: the error at the end of that Luau runs to the next line as
  // Luau's end-of-file range does, and one before a scene's `end` names that
  // `end`. A `store` declaration and a scene's parameters are Sparkdown's own,
  // and the validator reports them, with the range the checker would give.
  test.each([
    ["local x:", ["0:8-1:0 Expected type, got <eof>"]],
    ["local x: --[[c]]\nStory.", ["0:8-1:0 Expected type, got <eof>"]],
    ["scene s\n  local x:\nend", ["1:10-2:3 Expected type, got 'end'"]],
    ["local x --[[c]] :: number", ["0:16-0:18 Expected identifier when parsing expression, got '::'"]],
    ["store x: = 1", ["0:8-0:10 Expected type, got '='"]],
    ["store x:", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x:\nStory.", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x: -- note\nStory.", ["0:8-1:0 Expected type, got <eof>"]],
    ["store x:\nlocal y = 1", ["0:8-1:5 Expected type, got 'local'"]],
    ["scene s\n  store x:\nend", ["1:10-2:3 Expected type, got 'end'"]],
    ["scene s(a: )\nend", ["0:10-0:12 Expected type, got ')'"]],
    ["scene s(a: --[[c]] ?)\nend", ["0:10-0:20 Expected type, got '?'"]],
    ["scene s(: number)\nend", ["0:8-0:9 Expected identifier when parsing variable name, got ':'"]],
    ["scene s(a, :: number)\nend", ["0:11-0:13 Expected identifier when parsing variable name, got '::'"]],
    ["scene s(a :: number)\nend", ["0:10-0:12 Expected ')' (to close '(' at column 8), got '::'"]],
    ["scene s(a --[[c]] :: number)\nend", ["0:18-0:20 Expected ')' (to close '(' at column 8), got '::'"]],
    // A token Luau reads whole.
    ["scene s(a: 123)\nend", ["0:10-0:14 Expected type, got '123'"]],
    ["scene s(a: ..)\nend", ["0:10-0:13 Expected type, got '..'"]],
  ])("in a Sparkdown document, %j reports %j", (source, messages) => {
    expect(documentErrors(source)).toEqual(messages);
  });

  // A block comment of any length before the `::` or the token Luau finds.
  const long = "x".repeat(5000);
  test.each([
    ["a local target", `local x --[[${long}]] :: number`, ["0:5015-0:5017 Expected identifier when parsing expression, got '::'"]],
    ["a store declaration", `store x: --[[${long}]] = 1`, ["0:8-0:5017 Expected type, got '='"]],
  ])("in a Sparkdown document, a long comment in %s", (_position, source, messages) => {
    expect(documentErrors(source)).toEqual(messages);
  });
  test.each([
    ["a parameter", `function f(a --[[${long}]] :: number) end`],
    ["a parameter, with a leveled comment", `function f(a --[==[${long}]==] :: number) end`],
    ["a table field", `local t: { a --[[${long}]] :: number } = nil`],
  ])("a long comment before `::` in %s reports Luau's one error", (_position, source) => {
    const result = checkLuau(`${source}\n`);
    const luau = luauTypeErrors(result.diagnostics);
    expect(luau).toHaveLength(1);
    expect(result.syntaxDiagnostics.map(describeDiagnostic)).toEqual(luau);
  });

  // The loop still binds its variables when they are annotated.
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

  // A method call after a comma in the header is not a variable's annotation.
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
