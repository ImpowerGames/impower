// A Luau statement in a story body (a scene, a branch or the file's top
// level) ends at its physical line unless an open `(`, `[` or `{`, a long
// string or a block comment carries it on (#1907, slice S3 of #1904). Nothing
// else continues it: a trailing operator, an if expression's `then` or
// `else`, a type's `|` line and an indented line all leave the next line to
// the story. The statement's Luau meets its end of input at the line's end,
// so what it is missing there is Luau's error with `got <eof>`, as on an `&`
// line (#1374), and the next line plays.
import { describe, expect, test, vi } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { dumpTree, stripAnsi } from "./grammarSnapshot";

const URI = "inmemory:///main.sd";

/** Every error a full compile reports, with its range. */
const errorsOf = (text: string): string[] => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiledErrors(c);
};

/** Every error a compiler's compile of the document reports, with its range. */
const compiledErrors = (c: SparkdownCompiler): string[] => {
  const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
  return (program.diagnostics?.[URI] ?? [])
    .filter((d: any) => d.severity === DiagnosticSeverity.Error)
    .map((d: any) => {
      const message = typeof d.message === "string" ? d.message : d.message.value;
      return `${d.range.start.line}:${d.range.start.character}-${d.range.end.line}:${d.range.end.character} ${message}`;
    })
    .sort();
};

const run = (text: string) => {
  const ctx = makeRuntimeStoryFromSource(text);
  return { errors: ctx.errorMessages, warnings: ctx.warningMessages, output: ctx.story.ContinueMaximally() };
};

/** The parser's empty-match warnings while it reads `text`. */
const parserWarnings = (text: string): string[] => {
  const warnings: string[] = [];
  const warn = vi.spyOn(console, "warn").mockImplementation((...args) => {
    warnings.push(args.map(String).join(" "));
  });
  try {
    dumpTree(text);
  } finally {
    warn.mockRestore();
  }
  return warnings;
};

/** The top-level nodes of `text`'s tree, with their ranges. */
const topNodes = (text: string) =>
  stripAnsi(dumpTree(text))
    .split("\n")
    .map((line) => /^ [├└]─ (\S+) \[(\d+)\.\.(\d+)\]/.exec(line))
    .filter((m) => m !== null)
    .map((m) => ({ name: m[1], from: Number(m[2]), to: Number(m[3]) }));

/** The top-level nodes that cross the start of the line holding `marker`. */
const nodesCrossing = (text: string, marker: string) => {
  const lineStart = text.lastIndexOf("\n", text.indexOf(marker)) + 1;
  return topNodes(text).filter((node) => node.from < lineStart && node.to > lineStart);
};

/** Luau's missing-expression error at the end of the last line of `statement`. */
const missingAtLineEnd = (statement: string, firstLine = 0): string => {
  const lines = statement.split("\n");
  const line = firstLine + lines.length - 1;
  return `${line}:${lines.at(-1)!.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`;
};

describe("a trailing operator does not carry a story statement on (#1254)", () => {
  test.each([
    ["a declaration", "local a = 1 +"],
    ["a `store` declaration", "store a = 1 +"],
    ["an `&` declaration", "& local a = 1 +"],
    ["a reassignment", "store a = 0\na = 1 +"],
    ["a logical operator", "local a = true and"],
    ["a comparison", "local a = 1 =="],
    ["a concatenation", 'local a = "x" ..'],
  ])("%s ending in an operator leaves the next line to the story", (_name, statement) => {
    const source = `${statement}\nThe first story line is story, not an operand.\nAfter.\n`;
    expect(errorsOf(source)).toEqual([missingAtLineEnd(statement)]);
    expect(nodesCrossing(source, "The first")).toEqual([]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The first story line is story, not an operand.\nAfter.\n");
  });

  test("in a scene", () => {
    const source = [
      "-> s",
      "scene s",
      "  local a = 1 +",
      "  The first story line must not be an operand.",
      "  local b = 2",
      "  After {b}.",
      "end",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual(["2:15-3:0 Expected identifier when parsing expression, got <eof>"]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The first story line must not be an operand.\nAfter 2.\n");
  });
});

describe("an if expression's `else` or `then` ending its line does not take the next line (#1658)", () => {
  test.each([
    ["a reassignment's `else`", "store ready = true\nstore x = 0\nx = if ready then 1 else"],
    ["a declaration's `else`", "store ready = true\nlocal x = if ready then 1 else"],
    ["a reassignment's `then`", "store ready = true\nstore x = 0\nx = if ready then"],
  ])("%s at the top level", (_name, statement) => {
    const source = `${statement}\nThe hero waits.\nAfter this, the hero moves.\n`;
    expect(errorsOf(source)).toEqual([missingAtLineEnd(statement)]);
    expect(nodesCrossing(source, "The hero")).toEqual([]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The hero waits.\nAfter this, the hero moves.\n");
  });

  test("an indented reassignment in a scene, with the story line at column 0", () => {
    const source = [
      "store ready = true",
      "store x = 0",
      "-> s",
      "scene s",
      "  x = if ready then 1 else",
      "The hero waits.",
      "After this, the hero moves.",
      "end",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual(["4:26-5:0 Expected identifier when parsing expression, got <eof>"]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The hero waits.\nAfter this, the hero moves.\n");
  });

  test("an indented next line does not continue the if expression either", () => {
    const statement = "store ready = true\nlocal x = if ready then";
    const source = `${statement}\n  1 else 2\nAfter.\n`;
    expect(errorsOf(source)).toEqual([missingAtLineEnd(statement)]);
    expect(nodesCrossing(source, "  1 else 2")).toEqual([]);
  });
});

describe("an else value that begins with `end` on the next column-0 line (#1206)", () => {
  test.each(["ender", "endx", "end_time"])("`%s` is a story line, with no empty-match warning", (name) => {
    const statement = `local a = false\nlocal ${name} = 5\nlocal x = if a then 1 else`;
    const source = `${statement}\n${name}\nValue {x}.\n`;
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toEqual([missingAtLineEnd(statement)]);
    expect(nodesCrossing(source, `\n${name}\nValue`)).toEqual([]);
  });
});

describe("a block comment after a story declaration's keyword stays in the declaration (#1200)", () => {
  test.each([
    ["local", "local --[[c]] r = 1\nValue {r}.\n", "Value 1.\n"],
    ["store", "store --[[c]] r = 1\nValue {r}.\n", "Value 1.\n"],
    ["const", "const --[[c]] r = 1\nValue {r}.\n", "Value 1.\n"],
    ["two targets", "local --[[c]] r, s = 1, 2\nValue {r}{s}.\n", "Value 12.\n"],
    ["a comment glued to the target", "local --[[c]]r = 1\nValue {r}.\n", "Value 1.\n"],
    ["an `&` declaration", "& local --[[c]] r = 1\nValue {r}.\n", "Value 1.\n"],
  ])("%s", (_name, source, expected) => {
    const { errors, warnings, output } = run(source);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(output).toBe(expected);
  });

  test("the declaration holds the comment and its target", () => {
    const source = "local --[[c]] r = 1\n";
    expect(topNodes(source)[0]).toEqual({ name: "LuauSparkdownVariableDefinition", from: 0, to: source.indexOf("\n") });
  });
});

describe("a block comment after a story declaration's target is never story text (#1207)", () => {
  // Luau reads `local a --[[b]]print(1)` as `local a` and then `print(1)`.
  test.each([
    ["an untyped target", "local a --[[b]]print(1)"],
    ["a space before the call", "local a --[[b]] print(1)"],
    ["a typed target", "local a: number --[[b]]print(1)"],
    ["a target list", "local a, b --[[c]]print(1)"],
    ["store", "store a --[[b]]print(1)"],
    ["a comment that spans lines", "local a --[[b\n]]print(1)"],
  ])("%s", (_name, statement) => {
    const source = `${statement}\nAfter.\n`;
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe("1\nAfter.\n");
    expect(topNodes(source)[0]).toEqual({ name: "LuauSparkdownVariableDefinition", from: 0, to: statement.length });
  });
});

describe("a story `if` whose condition ends its line with a method colon (#1199, story form)", () => {
  test("the story line under it is not read into the condition", () => {
    const source = "store flag = true\n\nif flag:\n  Went down the true side.\nend\n";
    // Luau's first error for `if flag:` at its end of input.
    expect(errorsOf(source)).toEqual(["2:8-3:0 Expected identifier when parsing method name, got <eof>"]);
    expect(nodesCrossing(source, "  Went")).toEqual([
      expect.objectContaining({ name: "LuauSparkdownIfBlock" }),
    ]);
    const { warnings } = run(source);
    expect(warnings).toEqual([]);
  });
});

describe("an attribute that ends a story declaration's line has no function", () => {
  // In Luau code the function may follow on a later line (#1329); a story
  // declaration ends at its line, so the attribute is left without one.
  test("the function on the next line is not the attribute's", () => {
    const source = "store second = @[native]\nfunction() return 9 end\n";
    expect(errorsOf(source)).toContain("0:15-0:17 Expected 'function' declaration after attribute, but got <eof> instead");
    expect(nodesCrossing(source, "function()")).toEqual([]);
  });
});

describe("a story `if` header ends at its line", () => {
  test.each([
    ["`if`", "store x = 1\nstore y = 0\nif\n  x == 1\nthen\n  y = 2\nend\nValue {y}.\n", 2],
    ["`elseif`", "store x = 1\nif x == 2 then\n  Two.\nelseif\n  x == 1\nthen\n  One.\nend\n", 3],
  ])("an %s with no condition on its line is missing it at the line's end", (_name, source, line) => {
    expect(parserWarnings(source)).toEqual([]);
    const lineText = source.split("\n")[line]!;
    expect(errorsOf(source)).toEqual([`${line}:${lineText.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`]);
  });

  // Luau's reading of the condition stops at its unfinished expression, the
  // one error native Luau reports there; it says nothing about `then`.
  test.each([
    ["a trailing operator", "store a = 1\nif a == 1 and\n  a == 1\nthen\n  Text.\nend\n", "if a == 1 and"],
    ["an if expression's `then`", "store c = true\nif if c then\n  false\nelse true then\n  Text.\nend\n", "if if c then"],
    ["an `elseif` comparison", "store a = 1\nif a == 2 then\n  Two.\nelseif a ==\n  1 then\n  One.\nend\n", "elseif a =="],
  ])("a condition that ends its line with %s is missing its expression there", (_name, source, header) => {
    const line = source.split("\n").indexOf(header);
    expect(errorsOf(source)).toEqual([`${line}:${header.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`]);
  });

  test("a whole condition followed by a token on its line is missing its `then` before that token", () => {
    expect(errorsOf("store flag = true\nif flag print(1)\n  Text.\nend\n")).toEqual([
      "1:8-1:13 Expected 'then' when parsing if statement, got 'print'",
    ]);
  });
});

// A story loop's header ends at its line too, on the maintainer's
// instruction: this reverses #1344's condition on the line after `for` or
// `while` at story scope. In Luau code the condition still begins there.
describe("a story loop header ends at its line", () => {
  test.each([
    ["a `for` with its body on later lines", "store x = 0\nfor i = 1, 3 do\n  x = i\nend\nValue {x}.\n", "Value 3.\n"],
    ["a one-line `for`", "store x = 0\nfor i = 1, 3 do x = i end\nValue {x}.\n", "Value 3.\n"],
    ["a `while`", "store x = 3\nwhile x > 0 do\n  x = x - 1\nend\nValue {x}.\n", "Value 0.\n"],
    ["a `repeat` with its `until` condition on its line", "store x = 0\nrepeat\n  x = x + 1\nuntil x > 2\nValue {x}.\n", "Value 3.\n"],
    [
      "a `for` in a function, whose condition is on the next line",
      "Value {f()}.\nfunction f()\n  local x = 0\n  for\n    i = 1, 3\n  do\n    x = i\n  end\n  return x\nend\n",
      "Value 3.\n",
    ],
  ])("%s still runs", (_name, source, expected) => {
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe(expected);
  });

  test.each([
    ["for", "store x = 0\nfor\n  i = 1, 3\ndo\n  x = i\nend\n", "  i = 1, 3", "1:0-1:3 Expected `do` after the `for` loop's condition. Write `for ... do`, the body, then `end`."],
    ["for", "store x = 0\nfor i = 1, 3\ndo\n  x = i\nend\n", "do\n", "1:0-1:3 Expected `do` after the `for` loop's condition. Write `for ... do`, the body, then `end`."],
    ["while", "store x = 0\nwhile\n  x\ndo\n  x = nil\nend\n", "  x\n", "1:0-1:5 Expected `do` after the `while` loop's condition. Write `while ... do`, the body, then `end`."],
  ])("a `%s` whose condition or `do` is on a later line is missing it on its own line", (_keyword, source, later, error) => {
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toContain(error);
    expect(nodesCrossing(source, later)).toEqual([]);
  });

  test("the formatter keeps one space between a story `for`'s names, `in` and the iterator", () => {
    const text = "store t = {}\nfor _, v in pairs(t) do\n  Item.\nend\n";
    const registry = new SparkdownDocumentRegistry(["formatting"]);
    registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
    const annotations = registry.annotations(URI) as Record<string, any>;
    const header = { from: text.indexOf("for"), to: text.indexOf(" do") };
    const marks: string[] = [];
    for (const iter = annotations["formatting"]!.iter(0); iter.value; iter.next()) {
      if (iter.from >= header.from && iter.to <= header.to && /^\s+$/.test(text.slice(iter.from, iter.to))) {
        marks.push(`${text.slice(iter.from - 1, iter.to + 1)} ${JSON.stringify(iter.value.type)}`);
      }
    }
    expect(marks.filter((mark) => mark.endsWith('"extra"'))).toEqual([]);
  });

  test.each([
    ["a `while` condition that ends with an operator", "store x = 3\nwhile x > 0 and\n  x < 10 do\n  x = x - 1\nend\n", "1:15-2:0"],
    ["an `until` with its condition on the next line", "store x = 0\nrepeat\n  x = x + 1\nuntil\n  x > 2\n", "3:5-4:0"],
    ["an `until` condition that ends with an operator", "store x = 0\nrepeat\n  x = x + 1\nuntil x >\n  2\n", "3:9-4:0"],
  ])("%s is missing its expression at the line's end", (_name, source, at) => {
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toContain(`${at} Expected identifier when parsing expression, got <eof>`);
  });
});

describe("a block comment that runs over lines carries a story statement on", () => {
  // Its Luau meets its end of input at the end of the line the comment
  // closes on, and the error is placed on that line.
  test.each([
    ["a declaration", "local a = 1 + --[[ x\n ]]"],
    ["an `&` declaration", "& local a = 1 + --[[ x\n ]]"],
    ["a value list", "local a, b = 1, --[[ x\n ]] -- note"],
    ["a reassignment", "store a = 0\na = 1 + --[[ x\n ]]"],
  ])("%s is missing its value at the end of the comment's last line", (_name, statement) => {
    const lines = statement.split("\n");
    const line = lines.length - 1;
    expect(errorsOf(`${statement}\nThe hero.\n`)).toEqual([
      `${line}:${lines[line]!.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`,
    ]);
  });

  test("an edit that moves the end of input moves the error, as a cold compile places it", () => {
    const before = "& local a = 1 + --[[ x\n ]]\nThe hero.\n";
    const after = "& local a = 1 + --[[ x\n y ]]\nThe hero.\n";
    const c = new SparkdownCompiler();
    c.configure({
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: before, version: 1, languageId: "sparkdown" }],
    } as never);
    expect(compiledErrors(c)).toEqual(errorsOf(before));
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: { line: 1, character: 1 }, end: { line: 1, character: 1 } }, text: "y " }],
    } as never);
    expect(compiledErrors(c)).toEqual(errorsOf(after));
    expect(errorsOf(after)).toEqual(["1:5-2:0 Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("brackets carry a story statement on", () => {
  test("a multi-line store table declares", () => {
    const source = "store inventory = {\n  sword = 1,\n  shield = 2,\n}\nCount {inventory.sword + inventory.shield}.\n";
    const { errors, warnings, output } = run(source);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(output).toBe("Count 3.\n");
  });

  test.each([
    ["a declaration", "local x = math.max(1,\n  2)\nValue {x}.\n", "Value 2.\n"],
    ["an `&` line", "store x = 0\n& x = math.max(1,\n  2)\nValue {x}.\n", "Value 2.\n"],
    ["an `&` table", "store t = {}\n& t.c = {\n  3,\n}\nValue {t.c[1]}.\n", "Value 3.\n"],
    ["an attribute list", "store f = @[\n  native\n] function() return 5 end\nValue {f()}.\n", "Value 5.\n"],
  ])("a bracket spans lines in %s", (_name, source, expected) => {
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe(expected);
  });

  test.each([
    ["a declaration", "local x = math.max(1,"],
    ["an `&` line", "& print(1,"],
  ])("an unclosed `(` in %s reports Luau's missing `)` at the next header", (_name, statement) => {
    const source = `${statement}\n  2\nscene t\n  After.\nend\n`;
    expect(errorsOf(source)).toEqual(["1:3-2:0 Expected ')' (to close '(' at line 1), got <eof>"]);
    expect(topNodes(source).find((node) => node.name === "Scene")?.from).toBe(source.indexOf("scene t"));
  });

  // The block ends with the line its bracket closes on, so the story line
  // after it stays story, as the `&` block's own message says.
  test("an `&` block that a bracket carries past its line still leaves the story line after it", () => {
    const source = "-> s\nscene s\n  & do x = math.max(1,\n    2)\n  After.\nend\n";
    const missing = errorsOf(source).filter((error) => error.includes("missing its closing"));
    expect(missing).toEqual([
      "2:4-2:22 This `do` block is missing its closing `end` keyword on this `&` line. The following line remains story text.",
    ]);
    expect(nodesCrossing(source, "  After.")).toEqual([]);
  });

  test.each(["local x = f(g(", "local t = { a = { 1,", "& if ((", "x = t[u["])("a bracket inside a bracket stops at the next header too (`%s`)", (statement) => {
    const source = `store x = 0\n${statement}\n  1\nbranch b\n  After.\nend\n`;
    expect(topNodes(source).find((node) => node.name === "Branch")?.from).toBe(source.indexOf("branch b"));
  });
});

// The grammar's side of the rule: nothing a story statement reaches outside
// its brackets, strings, comments and the blocks that close at their own
// closer (a function, a `define` and the struct and layout blocks) takes a
// line break or begins at the next line, so no story statement can go on
// there. A capture is tokenized on its own text, so it cannot either.
describe("the story statement rules", () => {
  type Rule = { patterns?: { include?: string }[] };
  const repository = GRAMMAR_DEFINITION.repository as unknown as Record<string, Rule>;
  const CARRIERS = new Set([
    "LuauParenthetical",
    "LuauTable",
    "LuauPropertyIndexer",
    "LuauFunctionCallParameters",
    "LuauTypeTableStruct",
    "LuauTypeFunctionParameters",
    "LuauTypeofFunctionParameters",
    "LuauAttributeList",
    "LuauString",
    "LuauComment",
    "LuauValueTrailingBlockComment",
    "LuauTypeTrailingBlockComment",
    "LuauFunctionDefinition",
    "LuauAttributedFunctionValue",
    "LuauFunctionTypeDeclaration",
    "LuauDefine",
    "LuauStyle",
    "LuauLayout",
    "LuauScreen",
    "LuauComponent",
    "LuauAnimation",
    "LuauTheme",
    "LuauMorph",
  ]);
  const NEXT_LINE_RULES = [
    "Newline",
    "LuauTypeOperatorLineContinuation",
    "LuauLineContinuation",
    "LuauIndexerLineContinuation",
    "LuauMinusLineContinuation",
    "LuauCommaLineBreak",
    "LuauAssignmentLineBreak",
    "LuauConditionLeadingBreak",
    "LuauReturnLineBreak",
  ];

  test("reach no line break and no next-line rule outside a bracket, a string, a comment or a closed block", () => {
    const reached = new Map<string, string>();
    const queue = [
      "LuauSparkdownVariableDefinition",
      "LuauSparkdownReassignment",
      "LuauSparkdownExplicitStatement",
      "LuauSparkdownExplicitIfCondition",
      "LuauSparkdownExplicitLoopCondition",
      "LuauSparkdownExplicitUntilCondition",
    ];
    // The story blocks read their headers with these.
    expect(repository["LuauSparkdownIfBlock"]!.patterns).toContainEqual({ include: "#LuauSparkdownExplicitIfCondition" });
    expect(repository["LuauSparkdownForLoop"]!.patterns).toContainEqual({ include: "#LuauSparkdownExplicitLoopCondition" });
    expect(repository["LuauSparkdownWhileLoop"]!.patterns).toContainEqual({ include: "#LuauSparkdownExplicitLoopCondition" });
    expect(repository["LuauSparkdownControlBlock"]!.patterns).toContainEqual({ include: "#LuauSparkdownExplicitUntilCondition" });
    for (const name of queue) reached.set(name, name);
    while (queue.length) {
      const name = queue.shift()!;
      for (const p of repository[name]?.patterns ?? []) {
        const include = p.include?.slice(1);
        if (!include || CARRIERS.has(include) || reached.has(include)) continue;
        reached.set(include, `${reached.get(name)} > ${include}`);
        queue.push(include);
      }
    }
    expect([...reached.keys()].filter((name) => NEXT_LINE_RULES.includes(name)).map((name) => reached.get(name))).toEqual([]);
    expect(reached.has("LuauTypeLiteral")).toBe(false);
  });
});

describe("a type does not go on at a `|` line at story scope", () => {
  test("a declaration ending in its type ends at its line", () => {
    const source = "local v: number?\n| string\nAfter.\n";
    expect(nodesCrossing(source, "| string")).toEqual([]);
    expect(run(source).output).toBe("| string\nAfter.\n");
  });
});
