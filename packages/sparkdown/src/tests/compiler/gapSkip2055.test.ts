import type { SyntaxNode } from "@lezer/common";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { parseSource } from "./grammarSnapshot";
import { compareEnginesFull, formatDivergences } from "./scopeEquality";

const URI = "inmemory:///main.sd";

const errorsOf = (text: string): string[] => {
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  const program = compiler.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    });
};

const skippedNodes = (text: string) => {
  const found: { text: string; parent: string }[] = [];
  const visit = (node: SyntaxNode) => {
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.type.isError) found.push({ text: text.slice(child.from, child.to), parent: child.parent?.name ?? "" });
      visit(child);
    }
  };
  visit(parseSource(text).topNode);
  return found;
};

const STRUCTURAL_WORDS = ["end", "then", "do", "until", "else", "elseif"];

describe("both engines scope a structural word the open rule cannot read the same way (I-2048)", () => {
  const inputs = [
    ...STRUCTURAL_WORDS.map((word) => `Hello {x ${word}}\nAfter\n`),
    ...STRUCTURAL_WORDS.map((word) => `Hello {{x ${word}}}\nAfter\n`),
    ...["do", "until", "else", "elseif"].map((word) => `if x ${word} then\n  Hi.\nend\n`),
    ...["then", "until", "else", "elseif"].map((word) => `while x ${word} do\n  Hi.\nend\n`),
    ...["then", "until", "else", "elseif"].map((word) => `for i = 1, x ${word} do\n  Hi.\nend\n`),
  ];

  test("covers the ticket's 24 inputs", () => {
    expect(inputs).toHaveLength(24);
  });

  test.each(inputs)("%j", async (source) => {
    const { divergences } = await compareEnginesFull(source);
    expect(divergences, formatDivergences(source, divergences)).toEqual([]);
  });
});

describe("both engines read the rest of a header after a keyword glued to non-ASCII text the same way (I-2037)", () => {
  test.each(["if x == 1 then名\n", "while x < 3 do名\n"])("%j", async (source) => {
    const { divergences } = await compareEnginesFull(source);
    expect(divergences, formatDivergences(source, divergences)).toEqual([]);
  });
});

describe("both engines read an `if` after an unclosed table constructor the same way under the .luau root (I-2067)", () => {
  test("the `end` of the one-line `if`", async () => {
    const source = "local a = {4\nif curr then table.insert(stack, tonumber(curr)) end\n";
    const { divergences } = await compareEnginesFull(source, { luauFile: true });
    expect(divergences, formatDivergences(source, divergences)).toEqual([]);
  });
});

describe("text the grammar cannot read is reported where it is written (I-2055)", () => {
  test("an unreadable word in a function's `if` condition is Luau's error at that word, and the function ends at its own `end`", () => {
    const text = "function f()\n  if x do then\n    return 1\n  end\nend\nAfter.\n";
    expect(skippedNodes(text)).toEqual([{ text: "d", parent: "LuauIfBlockCondition_content" }]);
    const fn = parseSource(text).topNode.firstChild!;
    expect([fn.name, fn.to]).toEqual(["LuauFunctionDefinition", text.indexOf("\nAfter.")]);
    expect(errorsOf(text)).toContain("1:7-1:9 Expected 'then' when parsing if statement, got 'do'");
  });

  test("an unreadable word in a story `if` condition is Luau's error at that word, and the block is not reported unclosed", () => {
    const text = "scene start\n  if x do then\n    Hi.\n  end\nend\n";
    const errors = errorsOf(text);
    expect(errors).toEqual(["1:7-1:9 Expected 'then' when parsing if statement, got 'do'"]);
  });

  test("an unreadable word in a display-text interpolation is Luau's error at that word", () => {
    const text = "scene start\n  Hello {x then}.\n  After.\nend\n";
    expect(skippedNodes(text).map((n) => n.parent)).toEqual(["LuauInterpolatedStringExpression_content"]);
    expect(errorsOf(text)).toEqual(["1:11-1:15 Expected the end of the expression, got 'then'"]);
  });

  test.each([
    ["scene start\n  Hello {x end}.\n  After.\nend\n", ["1:8-1:10 Malformed interpolated string; did you forget to add a `}`?"]],
    ["scene start\n  Hello {x.\n  After.\nend\n", ["1:10-1:11 Expected identifier after '.' on the same line", "2:8-3:0 Expected identifier, got <eof>", "1:8-3:0 Malformed interpolated string; did you forget to add a `}`?"]],
  ])("a closer ends an interpolation that does not own it, at the closer: %j", (text, expected) => {
    expect(skippedNodes(text)).toEqual([]);
    expect(errorsOf(text).map((e) => e.split("\n")[0]!)).toEqual(expect.arrayContaining(expected));
  });

  test.each([
    ["style 1bad {\n  color = red\n}\n", "0:0-0:5", "`style`"],
    ["style s.t {\n  color = red\n}\n", "0:0-0:7", "`style s`"],
    ["morph 2m {\n  x = 1\n}\n", "0:0-0:5", "`morph`"],
    ["layout l in 2s {\n}\n", "0:0-0:8", "`layout l`"],
    ["component c(t) junk {\n}\n", "0:0-0:14", "`component c(t)`"],
  ])("a struct header %j is reported on its readable part", (text, range, readable) => {
    const header = errorsOf(text).filter((e) => e.includes("cannot be read past"));
    expect(header).toHaveLength(1);
    expect(header[0]).toContain(`${range} This`);
    expect(header[0]).toContain(`cannot be read past ${readable}`);
  });

  test.each([
    ["define bad.name with\n  x = 1\nend\nscene start\n  Hello!\nend\n", "`define bad`"],
    ["define bad ! with\n  x = 1\nend\nscene start\n  Hello!\nend\n", "`define bad`"],
  ])("a define header %j the grammar cannot read is reported on its readable part", (text, readable) => {
    expect(errorsOf(text)).toEqual([expect.stringMatching(new RegExp(`^0:0-0:10 .*cannot be read past ${readable}`))]);
  });

  test("a closer after a define header ends the define, as `end` on its own line does", () => {
    expect(errorsOf("define X as character end\nscene start\n  Hi.\nend\n")).toEqual([]);
  });
});

describe("a same-line `&` still ends a declaration, reassignment or `until` condition and starts the next statement (I-2038)", () => {
  test.each([
    ["scene start\n  local a = 0 & a = 2\n  Value {a}.\nend\n", "Value 2.\n"],
    ["store b = 0\nscene start\n  b = 1 & b = b + 2\n  Value {b}.\nend\n", "Value 3.\n"],
    ["scene start\n  local done = false\n  local n = 0\n  repeat\n    n = n + 1\n  until n > 1 & done = true\n  Value {n} {done}.\nend\n", "Value 2 true.\n"],
    ["scene start\n  local a = 0\n  & a = 1 & a = a + 1\n  Value {a}.\nend\n", "Value 2.\n"],
    ["scene start\n  local v = 1 + 2 & v = v * 2\n  Value {v}.\nend\n", "Value 6.\n"],
    ['scene start\n  local v = "a" .. "b" & v = v .. "c"\n  Value {v}.\nend\n', "Value abc.\n"],
    ["scene start\n  local v = if true then 1 else 2 & v = v + 1\n  Value {v}.\nend\n", "Value 2.\n"],
    ["scene start\n  local v = not false & v = not v\n  Value {v}.\nend\n", "Value false.\n"],
    ["scene start\n  local v = (1) & v = v + 1\n  Value {v}.\nend\n", "Value 2.\n"],
    ['scene start\n  local v = #"ab" & v = v + 1\n  Value {v}.\nend\n', "Value 3.\n"],
    ["scene start\n  local v = 2 == 2 & v = not v\n  Value {v}.\nend\n", "Value false.\n"],
    ["scene start\n  local v = -1 & v = v - 1\n  Value {v}.\nend\n", "Value -2.\n"],
  ])("%j plays as two statements", async (text, output) => {
    const { divergences } = await compareEnginesFull(text);
    expect(divergences, formatDivergences(text, divergences)).toEqual([]);
    expect(skippedNodes(text)).toEqual([]);
    const ctx = makeRuntimeStoryFromSource(text);
    expect(ctx.errorMessages).toEqual([]);
    expect(ctx.story.ContinueMaximally()).toBe(output);
  });

  const VALUES = [
    "0",
    '"s"',
    "a",
    "a.b",
    "t[1]",
    "f(1)",
    "a:m()",
    "1 + 2",
    "a == 1",
    'a .. "x"',
    "#t",
    "not a",
    "-1",
    "(1)",
    "{1}",
    "true",
    "nil",
    "a and b",
    "if a then 1 else 2",
  ];
  const FORMS = [
    (value: string) => `scene start\n  local v = ${value} & v = 2\nend\n`,
    (value: string) => `scene start\n  x = ${value} & x = 2\nend\n`,
    (value: string) => `scene start\n  repeat\n    Hi.\n  until ${value} & x = 2\nend\n`,
    (value: string) => `scene start\n  & x = ${value} & x = 2\nend\n`,
  ];
  const markOpensStatement = (text: string) => {
    const at = text.lastIndexOf(" & ") + 1;
    let opened = false;
    parseSource(text).iterate({
      enter: (node) => {
        if (node.name === "LuauExplicitStatementMark" && node.from === at) {
          opened = node.node.parent?.parent?.parent?.name === "LuauSparkdownExplicitStatement";
        }
      },
    });
    return opened;
  };
  test.each(FORMS.flatMap((form) => VALUES.map((value) => form(value))))("the second `&` in %j opens its own statement", async (text) => {
    expect(skippedNodes(text)).toEqual([]);
    expect(markOpensStatement(text)).toBe(true);
    const { divergences } = await compareEnginesFull(text);
    expect(divergences, formatDivergences(text, divergences)).toEqual([]);
  });

  test("an `&` with no space after it marks no statement, and Luau's error is at it", () => {
    expect(errorsOf("scene start\n  local v = 0&v = 2\n  Value {v}.\nend\n")).toEqual([
      "1:13-1:14 Expected identifier when parsing expression, got '&'",
    ]);
  });
});
