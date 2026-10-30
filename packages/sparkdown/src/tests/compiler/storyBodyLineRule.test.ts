import { describe, expect, test, vi } from "vitest";
import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { DiagnosticSeverity } from "../../compiler/types/SparkDiagnostic";
import { makeRuntimeStoryFromSource } from "../runtime/runtimeTestHarness";
import { dumpTree, stripAnsi } from "./grammarSnapshot";
import { parseOfficialTree } from "./officialAstTestUtils";

const URI = "inmemory:///main.sd";

const errorsOf = (text: string): string[] => {
  const c = new SparkdownCompiler();
  c.configure({
    files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
  } as never);
  return compiledErrors(c);
};

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

const topNodes = (text: string) =>
  stripAnsi(dumpTree(text))
    .split("\n")
    .map((line) => /^ [├└]─ (\S+) \[(\d+)\.\.(\d+)\]/.exec(line))
    .filter((m) => m !== null)
    .map((m) => ({ name: m[1], from: Number(m[2]), to: Number(m[3]) }));

const nodesCrossing = (text: string, marker: string) => {
  const at = text.indexOf(marker);
  expect(at, `the marker ${JSON.stringify(marker)} is in the text`).toBeGreaterThanOrEqual(0);
  const lineStart = text.lastIndexOf("\n", at) + 1;
  return topNodes(text).filter((node) => node.from < lineStart && node.to > lineStart);
};

const missingAtLineEnd = (statement: string, firstLine = 0): string => {
  const lines = statement.split("\n");
  const line = firstLine + lines.length - 1;
  return `${line}:${lines.at(-1)!.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`;
};

const SCENE = "scene start\n";
const SCENE_LINES = SCENE.split("\n").length - 1;

const indented = (text: string): string => text.replace(/^(?=.)/gm, "  ");

const inScene = (body: string): string => `${SCENE}${indented(body)}end\n`;

const placed = (lines: string): string => {
  const all = lines.split("\n");
  const declarations = all.findIndex((line) => !/^(?:store|const)\b/.test(line));
  const split = declarations < 0 ? all.length : declarations;
  const top = all.slice(0, split).map((line) => `${line}\n`).join("");
  return `${top}${inScene(all.slice(split).join("\n"))}`;
};

const missingIn = (source: string, statement: string): string => {
  const last = statement.split("\n").at(-1)!.trim();
  const sourceLines = source.split("\n");
  const line = sourceLines.findIndex((text) => text.trim() === last);
  expect(line, `the statement's last line ${JSON.stringify(last)} is in the source`).toBeGreaterThanOrEqual(0);
  return `${line}:${sourceLines[line]!.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`;
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
    const source = placed(`${statement}\nThe first story line is story, not an operand.\nAfter.\n`);
    expect(errorsOf(source)).toEqual([missingIn(source, statement)]);
    expect(nodesCrossing(source, "The first")).toEqual([]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The first story line is story, not an operand.\nAfter.\n");
  });

  test("in a scene", () => {
    const source = [
      "scene start",
      "  local a = 1 +",
      "  The first story line must not be an operand.",
      "  local b = 2",
      "  After {b}.",
      "end",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual(["1:15-2:0 Expected identifier when parsing expression, got <eof>"]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The first story line must not be an operand.\nAfter 2.\n");
  });
});

describe("an if expression's `else` or `then` ending its line does not take the next line (#1658)", () => {
  test.each([
    ["a reassignment's `else`", "store ready = true\nstore x = 0\nx = if ready then 1 else"],
    ["a reassignment's `then`", "store ready = true\nstore x = 0\nx = if ready then"],
  ])("%s in the start scene", (_name, statement) => {
    const source = placed(`${statement}\nThe hero waits.\nAfter this, the hero moves.\n`);
    expect(errorsOf(source)).toEqual([missingIn(source, statement)]);
    expect(nodesCrossing(source, "The hero")).toEqual([]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The hero waits.\nAfter this, the hero moves.\n");
  });

  test("a declaration's `else` in a scene", () => {
    const statement = "local x = if ready then 1 else";
    const source = `store ready = true\n${inScene(`${statement}\nThe hero waits.\nAfter this, the hero moves.\n`)}`;
    expect(errorsOf(source)).toEqual([missingIn(source, statement)]);
    expect(nodesCrossing(source, "The hero")).toEqual([]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The hero waits.\nAfter this, the hero moves.\n");
  });

  test("an indented reassignment in a scene, with the story line at column 0", () => {
    const source = [
      "store ready = true",
      "store x = 0",
      "scene start",
      "  x = if ready then 1 else",
      "The hero waits.",
      "After this, the hero moves.",
      "end",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual(["3:26-4:0 Expected identifier when parsing expression, got <eof>"]);
    const { warnings, output } = run(source);
    expect(warnings).toEqual([]);
    expect(output).toBe("The hero waits.\nAfter this, the hero moves.\n");
  });

  test("an indented next line does not continue the if expression either", () => {
    const statement = "local x = if ready then";
    const source = `store ready = true\n${inScene(`${statement}\n  1 else 2\nAfter.\n`)}`;
    expect(errorsOf(source)).toEqual([missingIn(source, statement)]);
    expect(nodesCrossing(source, "  1 else 2")).toEqual([]);
  });
});

describe("an else value that begins with `end` on the next column-0 line (#1206)", () => {
  test.each(["ender", "endx", "end_time"])("`%s` is a story line, with no empty-match warning", (name) => {
    const statement = indented(`local a = false\nlocal ${name} = 5\nlocal x = if a then 1 else`);
    const source = `${SCENE}${statement}\n${name}\n  Value {x}.\nend\n`;
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toEqual([missingAtLineEnd(statement, SCENE_LINES)]);
    expect(nodesCrossing(source, `\n${name}\n  Value`)).toEqual([]);
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
  ])("%s", (_name, lines, expected) => {
    const { errors, warnings, output } = run(placed(lines));
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(output).toBe(expected);
  });

  test("the declaration holds the comment and its target", () => {
    const source = inScene("local --[[c]] r = 1\n");
    const from = source.indexOf("  local");
    expect(topNodes(source).find((node) => node.from === from)).toEqual({
      name: "LuauSparkdownVariableDefinition",
      from,
      to: source.indexOf("\n", from),
    });
  });
});

describe("a block comment after a story declaration's target is never story text (#1207)", () => {
  test.each([
    ["an untyped target", "local a --[[b]]print(1)"],
    ["a space before the call", "local a --[[b]] print(1)"],
    ["a typed target", "local a: number --[[b]]print(1)"],
    ["a target list", "local a, b --[[c]]print(1)"],
    ["a comment that spans lines", "local a --[[b\n]]print(1)"],
  ])("%s", (_name, statement) => {
    const source = inScene(`${statement}\nAfter.\n`);
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe("1\nAfter.\n");
    const written = indented(statement);
    const from = source.indexOf(written);
    expect(topNodes(source).find((node) => node.from === from)).toEqual({
      name: "LuauSparkdownVariableDefinition",
      from,
      to: from + written.length,
    });
  });

  test("the call after a `store` and a block comment is a statement the top level refuses", () => {
    const source = "store a --[[b]]print(1)\nscene start\n  After.\nend\n";
    expect(errorsOf(source)).toEqual([
      "0:0-0:23 statement must be inside a scene or branch; the top level holds declarations only",
    ]);
    expect(topNodes(source).find((node) => node.from === 0)).toEqual({
      name: "LuauSparkdownVariableDefinition",
      from: 0,
      to: source.indexOf("\n"),
    });
  });
});

describe("a story `if` whose condition ends its line with a method colon (#1199, story form)", () => {
  test("the story line under it is not read into the condition", () => {
    const source = "store flag = true\n\nscene start\n  if flag:\n    Went down the true side.\n  end\nend\n";
    expect(errorsOf(source)).toEqual(["3:10-4:0 Expected identifier when parsing method name, got <eof>"]);
    expect(nodesCrossing(source, "    Went")).toEqual([
      expect.objectContaining({ name: "LuauSparkdownIfBlock" }),
    ]);
    const { warnings } = run(source);
    expect(warnings).toEqual([]);
  });
});

describe("an attribute that ends a story declaration's line has no function", () => {
  test("the function on the next line is not the attribute's", () => {
    const source = "store second = @[native]\nscene start\n  function() return 9 end\nend\n";
    expect(errorsOf(source)).toContain("0:15-0:17 Expected 'function' declaration after attribute, but got <eof> instead");
    expect(nodesCrossing(source, "function()")).toEqual([]);
  });
});

describe("a story `if` header ends at its line", () => {
  test.each([
    ["`if`", "store x = 1\nstore y = 0\nscene start\n  if\n    x == 1\n  then\n    y = 2\n  end\n  Value {y}.\nend\n", 3],
    ["`elseif`", "store x = 1\nscene start\n  if x == 2 then\n    Two.\n  elseif\n    x == 1\n  then\n    One.\n  end\nend\n", 4],
  ])("an %s with no condition on its line is missing it at the line's end", (_name, source, line) => {
    expect(parserWarnings(source)).toEqual([]);
    const lineText = source.split("\n")[line]!;
    expect(errorsOf(source)).toEqual([`${line}:${lineText.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`]);
  });

  test.each([
    ["a trailing operator", "store a = 1\nscene start\n  if a == 1 and\n    a == 1\n  then\n    Text.\n  end\nend\n", "  if a == 1 and"],
    ["an if expression's `then`", "store c = true\nscene start\n  if if c then\n    false\n  else true then\n    Text.\n  end\nend\n", "  if if c then"],
    ["an `elseif` comparison", "store a = 1\nscene start\n  if a == 2 then\n    Two.\n  elseif a ==\n    1 then\n    One.\n  end\nend\n", "  elseif a =="],
  ])("a condition that ends its line with %s is missing its expression there", (_name, source, header) => {
    const line = source.split("\n").indexOf(header);
    expect(errorsOf(source)).toEqual([`${line}:${header.length}-${line + 1}:0 Expected identifier when parsing expression, got <eof>`]);
  });

  test("a message naming `<eof>` is plain text, so the tooltip shows the token", () => {
    const messageOf = (text: string, start: string) => {
      const c = new SparkdownCompiler();
      c.configure({
        files: [{ uri: URI, type: "script", name: "main", ext: "sd", text, version: 1, languageId: "sparkdown" }],
      } as never);
      const program = c.compile({ textDocument: { uri: URI } } as never).program as any;
      return (program.diagnostics?.[URI] ?? []).map((d: any) => d.message).find((m: any) => (m.value ?? m).startsWith(start));
    };
    expect(messageOf("scene start\n  if true\n  The door opens.\n  end\nend\n", "Expected 'then'")).toEqual({
      kind: "plaintext",
      value: "Expected 'then' when parsing if statement, got <eof>",
    });
    expect(messageOf("scene start\n  & if true then\n  Text.\nend\n", "This `if` block")).toEqual(expect.objectContaining({ kind: "markdown" }));
  });

  test("a whole condition followed by a token on its line is missing its `then` before that token", () => {
    expect(errorsOf("store flag = true\nscene start\n  if flag print(1)\n    Text.\n  end\nend\n")).toEqual([
      "2:10-2:15 Expected 'then' when parsing if statement, got 'print'",
    ]);
  });
});

describe("a story loop header ends at its line", () => {
  test.each([
    ["a `for` with its body on later lines", "store x = 0\nscene start\n  for i = 1, 3 do\n    x = i\n  end\n  Value {x}.\nend\n", "Value 3.\n"],
    ["a one-line `for`", "store x = 0\nscene start\n  for i = 1, 3 do x = i end\n  Value {x}.\nend\n", "Value 3.\n"],
    ["a `while`", "store x = 3\nscene start\n  while x > 0 do\n    x = x - 1\n  end\n  Value {x}.\nend\n", "Value 0.\n"],
    ["a `repeat` with its `until` condition on its line", "store x = 0\nscene start\n  repeat\n    x = x + 1\n  until x > 2\n  Value {x}.\nend\n", "Value 3.\n"],
    [
      "a `for` in a function, whose condition is on the next line",
      "scene start\n  Value {f()}.\nend\nfunction f()\n  local x = 0\n  for\n    i = 1, 3\n  do\n    x = i\n  end\n  return x\nend\n",
      "Value 3.\n",
    ],
  ])("%s still runs", (_name, source, expected) => {
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe(expected);
  });

  test.each([
    ["for", "store x = 0\nscene start\n  for\n    i = 1, 3\n  do\n    x = i\n  end\nend\n", "    i = 1, 3", "2:5-3:0 Expected identifier when parsing variable name, got <eof>"],
    ["for", "store x = 0\nscene start\n  for i = 1, 3\n  do\n    x = i\n  end\nend\n", "  do\n", "2:14-3:0 Expected 'do' when parsing for loop, got <eof>"],
    ["while", "store x = 0\nscene start\n  while\n    x\n  do\n    x = nil\n  end\nend\n", "    x\n", "2:7-3:0 Expected identifier when parsing expression, got <eof>"],
  ])("a `%s` whose condition or `do` is on a later line is missing it on its own line", (_keyword, source, later, error) => {
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toContain(error);
    expect(nodesCrossing(source, later)).toEqual([]);
  });

  test.each(["& while true", "& for k, v", "& for i = 1, 3"])(
    "`%s` before a story line reports Luau's error at its line's end",
    (header) => {
      const native = parseOfficialTree(`${header.slice(2)}\n`).errors[0]!;
      const source = inScene(`${header}\nThe hero waits.\n`);
      expect(errorsOf(source)).toEqual([`${SCENE_LINES}:${header.length + 2}-${SCENE_LINES + 1}:0 ${native.message}`]);
      expect(run(source).output).toBe("The hero waits.\n");
    },
  );

  test("a marked loop in a scene, and one with a token where its `do` should be, report Luau's error", () => {
    expect(errorsOf("scene start\n  & while true\n  The hero waits.\nend\n")).toEqual([
      "1:14-2:0 Expected 'do' when parsing while loop, got <eof>",
    ]);
    expect(errorsOf(inScene("& while true print(1)\nThe hero waits.\n"))).toEqual([
      "1:15-1:20 Expected 'do' when parsing while loop, got 'print'",
    ]);
  });

  test.each([
    ["& while false do end while true", "Expected 'do' when parsing while loop, got <eof>"],
    ["& while false do end for k, v", "Expected 'in' when parsing for loop, got <eof>"],
    ["& for i = 1, 0 do end while true", "Expected 'do' when parsing while loop, got <eof>"],
    ["& for i = 1, 0 do end for k, v", "Expected 'in' when parsing for loop, got <eof>"],
  ])("a header-only loop after a whole loop on its marked line still reports its error: `%s`", (line, message) => {
    const source = inScene(`${line}\nThe hero waits.\n`);
    expect(errorsOf(source)).toEqual([`${SCENE_LINES}:${line.length + 2}-${SCENE_LINES + 1}:0 ${message}`]);
    expect(run(source).output).toBe("The hero waits.\n");
  });

  test.each([
    ["while", "store x = 0\nscene start\n  & while x < 2 do x = x + 1 end\n  Value {x}.\nend\n", "Value 2.\n"],
    ["for", "store x = 0\nscene start\n  & for i = 1, 3 do x = i end\n  Value {x}.\nend\n", "Value 3.\n"],
  ])("a marked `%s` with its `do` block still runs", (_keyword, source, output) => {
    expect(errorsOf(source)).toEqual([]);
    expect(run(source).output).toBe(output);
  });

  test.each([
    ["while true print(1)", "1:13-1:18 Expected 'do' when parsing while loop, got 'print'"],
    ["for i = 1, 3 print(i)", "1:15-1:20 Expected 'do' when parsing for loop, got 'print'"],
  ])("`%s`, with a token where its `do` should be, reports Luau's error at that token", (header, error) => {
    expect(parseOfficialTree(`${header}\n`).errors[0]!.message).toBe(error.slice(error.indexOf(" ") + 1));
    expect(errorsOf(inScene(`${header}\nStory.\n`))).toEqual([error]);
  });

  test.each(["for i = 1, 3", "for", "while true", "while", "for _, v in pairs({})"])(
    "`%s` before a story line reports Luau's error at its line's end",
    (header) => {
      const native = parseOfficialTree(`${header}\n`).errors[0]!;
      const source = inScene(`${header}\nThe hero waits.\n`);
      expect(errorsOf(source)).toEqual([`${SCENE_LINES}:${header.length + 2}-${SCENE_LINES + 1}:0 ${native.message}`]);
      expect(run(source).output).toBe("The hero waits.\n");
    },
  );

  test("the formatter keeps one space between a story `for`'s names, `in` and the iterator", () => {
    const text = "store t = {}\nscene start\n  for _, v in pairs(t) do\n    Item.\n  end\nend\n";
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
    ["a `while` condition that ends with an operator", "store x = 3\nscene start\n  while x > 0 and\n    x < 10 do\n    x = x - 1\n  end\nend\n", "2:17-3:0"],
    ["an `until` with its condition on the next line", "store x = 0\nscene start\n  repeat\n    x = x + 1\n  until\n    x > 2\nend\n", "4:7-5:0"],
    ["an `until` condition that ends with an operator", "store x = 0\nscene start\n  repeat\n    x = x + 1\n  until x >\n    2\nend\n", "4:11-5:0"],
  ])("%s is missing its expression at the line's end", (_name, source, at) => {
    expect(parserWarnings(source)).toEqual([]);
    expect(errorsOf(source)).toContain(`${at} Expected identifier when parsing expression, got <eof>`);
  });
});

describe("a statement later on the line keeps its own continuation", () => {
  test.each([
    ["a function", inScene("local a = 1 local function f()\n  return 2\nend\nValue {f()}.\n"), "Value 2.\n"],
    ["a reassignment's call", inScene("local a = 0 a = math.max(1,\n  2)\nValue {a}.\n"), "Value 2.\n"],
    ["a declaration's call", inScene("local a = 0 local b = math.max(1,\n  2)\nValue {b}.\n"), "Value 2.\n"],
    ["a function value", inScene("local a = 0 local f = function()\n  return 2\nend\nValue {f()}.\n"), "Value 2.\n"],
    ["an `&` call", inScene("local a = 0 & a = math.max(1,\n  2)\nValue {a}.\n"), "Value 2.\n"],
    ["a story `if`", inScene("local a = 0 if true then\n  Yes.\nend\n"), "Yes.\n"],
    ["a long string", `${SCENE}  local a = 0 a = [[two\nlines]]\n  Value {a}.\nend\n`, "Value two\nlines.\n"],
    ["a block comment", inScene("local a = 0 a = --[[two\nlines]] 2\nValue {a}.\n"), "Value 2.\n"],
    ["a story `while`", inScene("local a = 0 while a < 2 do\n  a = a + 1\nend\nValue {a}.\n"), "Value 2.\n"],
  ])("%s", (_name, source, output) => {
    expect(errorsOf(source)).toEqual([]);
    expect(run(source).output).toBe(output);
  });

  test("a statement inside the later block still ends at its own line", () => {
    const source = inScene("local a = 0 if true then\n  local b = 1 +\n  local c = 2\n  Value {c}.\nend\n");
    expect(errorsOf(source)).toEqual(["2:17-3:0 Expected identifier when parsing expression, got <eof>"]);
    expect(run(source).output).toBe("Value 2.\n");
  });

  test.each([
    ["local a = 0 while true", "1:24-2:0 Expected 'do' when parsing while loop, got <eof>"],
    ["local a = 0 for i = 1, 3", "1:26-2:0 Expected 'do' when parsing for loop, got <eof>"],
  ])("a header-only loop after a statement on its line still reports its missing `do`: %s", (line, error) => {
    expect(errorsOf(inScene(`${line}\nStory.\n`))).toEqual([error]);
  });
});

describe("a block comment that runs over lines carries a story statement on", () => {
  test.each([
    ["a declaration", "local a = 1 + --[[ x\n ]]"],
    ["an `&` declaration", "& local a = 1 + --[[ x\n ]]"],
    ["a value list", "local a, b = 1, --[[ x\n ]] -- note"],
    ["a reassignment", "store a = 0\na = 1 + --[[ x\n ]]"],
  ])("%s is missing its value at the end of the comment's last line", (_name, statement) => {
    const source = placed(`${statement}\nThe hero.\n`);
    expect(errorsOf(source)).toEqual([missingIn(source, statement)]);
  });

  test("an edit that moves the end of input moves the error, as a cold compile places it", () => {
    const before = inScene("& local a = 1 + --[[ x\n ]]\nThe hero.\n");
    const after = inScene("& local a = 1 + --[[ x\n y ]]\nThe hero.\n");
    const c = new SparkdownCompiler();
    c.configure({
      files: [{ uri: URI, type: "script", name: "main", ext: "sd", text: before, version: 1, languageId: "sparkdown" }],
    } as never);
    expect(compiledErrors(c)).toEqual(errorsOf(before));
    c.updateDocument({
      textDocument: { uri: URI, version: 2 },
      contentChanges: [{ range: { start: { line: 2, character: 3 }, end: { line: 2, character: 3 } }, text: "y " }],
    } as never);
    expect(compiledErrors(c)).toEqual(errorsOf(after));
    expect(errorsOf(after)).toEqual(["2:7-3:0 Expected identifier when parsing expression, got <eof>"]);
  });
});

describe("brackets carry a story statement on", () => {
  test("a multi-line store table declares", () => {
    const source = "store inventory = {\n  sword = 1,\n  shield = 2,\n}\nscene start\n  Count {inventory.sword + inventory.shield}.\nend\n";
    const { errors, warnings, output } = run(source);
    expect(errors).toEqual([]);
    expect(warnings).toEqual([]);
    expect(output).toBe("Count 3.\n");
  });

  test.each([
    ["a declaration", inScene("local x = math.max(1,\n  2)\nValue {x}.\n"), "Value 2.\n"],
    ["an `&` line", "store x = 0\nscene start\n  & x = math.max(1,\n    2)\n  Value {x}.\nend\n", "Value 2.\n"],
    ["an `&` table", "store t = {}\nscene start\n  & t.c = {\n    3,\n  }\n  Value {t.c[1]}.\nend\n", "Value 3.\n"],
    ["an attribute list", "store f = @[\n  native\n] function() return 5 end\nscene start\n  Value {f()}.\nend\n", "Value 5.\n"],
  ])("a bracket spans lines in %s", (_name, source, expected) => {
    const { errors, output } = run(source);
    expect(errors).toEqual([]);
    expect(output).toBe(expected);
  });

  test("an unclosed `(` in an `&` line reports Luau's missing `)` at the next header", () => {
    const source = inScene("& print(1,\n  2\nbranch t\n  After.\nend\n");
    expect(errorsOf(source)).toEqual(["2:5-3:0 Expected ')' (to close '(' at line 2), got <eof>"]);
    expect(topNodes(source).find((node) => node.name === "Branch")?.from).toBe(source.indexOf("  branch t"));
  });

  test("an unclosed `(` in a declaration reports Luau's error for its line alone", () => {
    const source = inScene("local x = math.max(1,\n  2\nbranch t\n  After.\nend\n");
    expect(errorsOf(source)).toEqual(["1:23-2:0 Expected identifier when parsing expression, got <eof>"]);
    expect(topNodes(source).find((node) => node.name === "Branch")?.from).toBe(source.indexOf("  branch t"));
  });

  test("an `&` block that a bracket carries past its line still leaves the story line after it", () => {
    const source = "scene start\n  & do x = math.max(1,\n    2)\n  After.\nend\n";
    const missing = errorsOf(source).filter((error) => error.includes("missing its closing"));
    expect(missing).toEqual([
      "1:4-1:22 This `do` block is missing its closing `end` keyword on this `&` line. The following line remains story text.",
    ]);
    expect(nodesCrossing(source, "  After.")).toEqual([]);
  });

  test.each(["local x = f(g(", "local t = { a = { 1,", "& if ((", "x = t[u["])("a bracket inside a bracket stops at the next header too (`%s`)", (statement) => {
    const source = `store x = 0\nscene start\n  ${statement}\n    1\n  branch b\n    After.\n  end\nend\n`;
    expect(topNodes(source).find((node) => node.name === "Branch")?.from).toBe(source.indexOf("  branch b"));
  });
});

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
    const source = inScene("local v: number?\n| string\nAfter.\n");
    expect(nodesCrossing(source, "| string")).toEqual([]);
    expect(run(source).output).toBe("| string\nAfter.\n");
  });
});
