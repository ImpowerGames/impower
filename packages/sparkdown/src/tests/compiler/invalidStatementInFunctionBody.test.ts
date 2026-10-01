// A function body is Luau. A line there that is not a Luau statement
// (`Hello there.`, `Hi, Bob`, a lone `Hello`) is reported once, with Luau's
// parser's first error for it and its range, and its names get the warnings
// Luau's type checker gives them; the function still ends at its own `end`
// (#1158).
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { SparkdownDocumentRegistry } from "../../compiler/classes/SparkdownDocumentRegistry";
import { parseLuau } from "../../compiler/typecheck/DefinitionParser";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { checkLuau } from "../luau-conformance/typecheckTestHarness";

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

interface Found {
  message: string;
  severity: number | undefined;
  start: { line: number; character: number } | undefined;
  end: { line: number; character: number } | undefined;
}

function diagnostics(program: any): Found[] {
  const all: Found[] = [];
  for (const list of Object.values(program.diagnostics ?? {}) as any[]) {
    for (const d of list) {
      all.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        start: d.range?.start,
        end: d.range?.end,
      });
    }
  }
  return all;
}

const byPosition = (a: Found, b: Found) =>
  a.start!.line - b.start!.line || a.start!.character - b.start!.character;

const errorsOf = (source: string) =>
  diagnostics(compile(source))
    .filter((d) => d.severity === 1)
    .sort(byPosition);

const warningsOf = (source: string) =>
  diagnostics(compile(source))
    .filter((d) => d.severity === 2)
    .sort(byPosition);

/** Luau's parser's first error for `source` read as a Luau file (ASCII only). */
function luauFirstError(source: string): Found {
  const error = parseLuau(source).errors[0];
  expect(error, "Luau reports an error").toBeDefined();
  return {
    message: error!.message,
    severity: 1,
    start: { line: error!.location.begin.line, character: error!.location.begin.column },
    end: { line: error!.location.end.line, character: error!.location.end.column },
  };
}

/**
 * The warnings Luau's type checker gives the same source as a Luau file, in
 * the non-strict mode a Sparkdown file is checked in: there an assignment to
 * an undeclared global is not an unknown global.
 */
const luauWarningsOf = (source: string): Found[] =>
  checkLuau(source, { mode: "nonstrict" })
    .diagnostics.filter((d: any) => d.code !== "SyntaxError")
    .map((d: any) => ({
      message: d.message,
      severity: 2,
      start: { line: d.line, character: d.column },
      end: { line: d.endLine, character: d.endColumn },
    }))
    .sort(byPosition);

/** `line` alone in a function body. */
const inBody = (line: string) => `function greet()\n  ${line}\nend\n`;

/** The lines to read to the end, as a runtime story plays them. */
function playedLines(source: string): string[] {
  const program = compile(source);
  const story = new RuntimeStory(program.compiled as Record<string, any>);
  const lines: string[] = [];
  while (story.canContinue) {
    const text = story.Continue();
    if (text) lines.push(text);
  }
  return lines;
}

describe("a line in a function body that is not a Luau statement (#1158)", () => {
  // The ticket's lines, the shapes review found, and lines that only the
  // lines around them could make a statement: each gets the one error Luau's
  // parser reports first for it, at Luau's range, which for a comma list
  // can be the next line's token.
  it.each([
    "Hello there.",
    "Hello there, friend.",
    "salt and pepper.",
    "I will return tomorrow.",
    "Hello there",
    "Hello!",
    "Yes?",
    "Mr.Smith waves.",
    "U.S. is big.",
    "Hello.",
    "U.S.",
    "Hello, I am here.",
    "Yes, 5 times.",
    'He said "the end" today.',
    "Hi, Bob",
    "Hello",
    "a, f()",
    "a, b[1]",
    "Hi -- the end of it",
    "Well, friend.",
    "1 + 2",
    "42",
    '"hi"',
    "{}",
    "true",
    "nil",
    "#t",
    "(t)",
    "a and b",
  ])("reports %j once, with Luau's first error and range", (line) => {
    const source = inBody(line);
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
  });

  it.each(["Hello there.", "Hello, I am here.", "Hi, Bob", "Hello"])(
    "gives the names of %j the warnings Luau gives them",
    (line) => {
      const source = inBody(line);
      expect(warningsOf(source)).toEqual(luauWarningsOf(source));
    },
  );

  it("reports each such line of a body once", () => {
    const source = "function greet()\n  Hello there.\n  How are you?\nend\n";
    const errors = errorsOf(source);
    expect(errors.map((d) => d.start!.line)).toEqual([1, 2]);
    expect(errors[0]).toEqual(luauFirstError(inBody("Hello there.")));
  });

  it("reports a `.` with no name after it, before a line of names, as a Sparkdown access path", () => {
    // Luau would read the next line's first word as the member.
    const source = `function greet()\n  Hello.\n  How are you?\nend\n`;
    expect(errorsOf(source)[0]).toMatchObject({
      message: expect.stringMatching(/^Expected identifier after '\.' on the same line/),
      start: { line: 1, character: 7 },
      end: { line: 1, character: 8 },
    });
  });

  it("reports a lone name after a number that ends with `.`, which is no dangling access", () => {
    // `1.` is a number; the name on the next line is a statement of its own.
    const source = "function f()\n  local x = 1.\n  y\nend\n";
    expect(errorsOf(source)).toEqual([
      {
        message: "Incomplete statement: expected assignment or a function call",
        severity: 1,
        start: { line: 2, character: 2 },
        end: { line: 2, character: 3 },
      },
    ]);
  });

  it("keeps an `end` in a string or a comment inside the line, so the function ends at its own", () => {
    for (const line of ['He said "the end" today.', "Hello there -- the end"]) {
      const source = `function greet()\n  ${line}\nend\nAfter it.\n`;
      expect(errorsOf(source), line).toHaveLength(1);
      expect(playedLines(source), line).toEqual(["After it.\n"]);
    }
  });

  it("leaves a name that the next line calls a method on (`obj` then `:method()`)", () => {
    const source =
      "function greet(t)\n  t\n    :insert(1)\nend\n";
    expect(errorsOf(source)).toEqual([]);
  });

  it("leaves a multiple assignment alone", () => {
    const source = `function swap(a, b)\n  a, b = b, a\n  return a, b\nend\n`;
    expect(errorsOf(source)).toEqual([]);
  });

  it("reports such a line after a statement in the body", () => {
    const source = `function greet()\n  local x = 1\n  Hello there.\n  return x\nend\n`;
    expect(errorsOf(source)).toEqual([
      { ...luauFirstError(inBody("Hello there.")), start: { line: 2, character: 2 }, end: { line: 2, character: 7 } },
    ]);
  });

  it("reports such a line in a block inside the body", () => {
    const source = `function greet(n)\n  if n > 1 then\n    Hello there.\n  end\nend\n`;
    expect(errorsOf(source).map((d) => [d.start!.line, d.message])).toEqual([
      [2, "Incomplete statement: expected assignment or a function call"],
    ]);
  });

  it.each([
    ["a for loop", "for i = 1, 2 do\n    Hello there.\n  end"],
    ["a while loop", "while false do\n    Hello there.\n  end"],
    ["a repeat loop", "repeat\n    Hello there.\n  until true"],
    ["a do block", "do\n    Hello there.\n  end"],
    ["an else branch", "if false then\n  else\n    Hello there.\n  end"],
  ])("reports such a line in %s", (_, block) => {
    const source = `function greet()\n  ${block}\nend\n`;
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
  });

  it.each([
    ["an anonymous function", "function greet()\n  function() end\nend\n"],
    ["`...`", "function greet(...)\n  ...\nend\n"],
    ["a table written across lines", "function greet()\n  {\n    answer = 42,\n  }\nend\n"],
  ])("reports %s as a statement with Luau's first error", (_, source) => {
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
  });

  it("calls a name or a call with the strings and tables on the lines after it", () => {
    const source = [
      'store got = ""',
      "",
      "function note(s)",
      "  got = got .. s",
      "end",
      "",
      "function size(t)",
      "  got = got .. #t",
      "end",
      "",
      "function f()",
      "  local t = { add = note }",
      "  note",
      '    "a"',
      "  size",
      "    { 1, 2 }",
      "  note -- the next one",
      "",
      "    'b'",
      "  t.add",
      '    "c"',
      "  (note)",
      '    "d"',
      "  return got",
      "end",
      "",
      "{f()}",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual(["a2bcd\n"]);
  });

  it.each([
    ["a declaration", "  local x = size\n    { 1, 2 }\n  return x", "2"],
    ["a declaration of a string's call", '  local x = id\n    "a"\n  return x', "a"],
    ["a reassignment", "  local x = 0\n  x = size\n    { 1, 2, 3 }\n  return x", "3"],
    ["a return", '  return id\n    "b"', "b"],
    ["a value after a line-ending `=`", "  local x =\n    size\n    { 1 }\n  return x", "1"],
    ["a table field", "  local t = { f = size }\n  local x = t.f\n    { 1, 2, 3, 4 }\n  return x", "4"],
  ])("calls the value of %s with a string or table on the next line", (_, body, played) => {
    const source = `function size(t)\n  return #t\nend\n\nfunction id(s)\n  return s\nend\n\nfunction f()\n${body}\nend\n\n{f()}\n`;
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual([`${played}\n`]);
  });

  it("calls the result of a call with the argument on the next line", () => {
    const source = [
      "function maker(a)",
      "  return function(b)",
      "    return a .. b",
      "  end",
      "end",
      "",
      "function f()",
      '  local x = maker "A"',
      '    "B"',
      "  return x",
      "end",
      "",
      "{f()}",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual(["AB\n"]);
  });

  it("calls the result with each argument on the lines after a callee", () => {
    const source = [
      "function maker(a)",
      "  return function(b)",
      "    return a .. b",
      "  end",
      "end",
      "",
      "function f()",
      "  local x = maker",
      '    "A"',
      '    "B"',
      "  local y = (maker)",
      '    "C"',
      '    "D"',
      "  return x .. y",
      "end",
      "",
      "{f()}",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual(["ABCD\n"]);
  });

  it("reports a line after a long string that holds `--`", () => {
    for (const value of ["[[--]]", "[=[--]=]"]) {
      const source = `function f()\n  local x = ${value}\n  Hello\nend\nAfter it.\n`;
      expect(errorsOf(source), value).toEqual([luauFirstError(source)]);
    }
  });

  it("ends a line that is not a statement before a block comment that runs on", () => {
    // The `end` inside the comment closes nothing. Luau reads the `Hello`
    // after the comment as the member `there.` leaves for it, so the one
    // error is the first line's.
    const source = "function f()\n  Hello there. --[[\nend\n]]\n  Hello\nend\nAfter it.\n";
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
    expect(playedLines(source)).toEqual(["After it.\n"]);
  });

  it("reports a line after a complete `...` value", () => {
    const source = "function f(...)\n  local x = ...\n  Hello\nend\n";
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
  });

  it("reports a `.` that no name follows once when the next line is a comma list", () => {
    const source = "function g()\n  U.S.\n  Hi, Bob\nend\nAfter it.\n";
    expect(errorsOf(source)).toEqual([
      expect.objectContaining({
        message: expect.stringMatching(/^Expected identifier after '\.' on the same line/),
        start: { line: 1, character: 5 },
      }),
    ]);
    expect(playedLines(source)).toEqual(["After it.\n"]);
  });

  it("reports the expressions of a define body that are not statements", () => {
    const source = 'define foo as object with\n  name = "Orion"\n  Hello\n  Hi, Bob\n  1 + 2\nend\n';
    // `Hi, Bob` gets Luau's range at the next token, the `1` below it.
    expect(errorsOf(source).map((d) => [d.start!.line, d.start!.character, d.message])).toEqual([
      [2, 2, "Incomplete statement: expected assignment or a function call"],
      [4, 2, "Expected '=' when parsing assignment, got '1'"],
      [4, 2, luauFirstError("function f()\n  1 + 2\nend\n").message],
    ]);
  });

  it("reports Luau's range past a long comment before the next token", () => {
    const source = `function greet()\n  Hi, Bob\n  --[[${"x".repeat(5000)}]]\nend\n`;
    expect(errorsOf(source)).toEqual([luauFirstError(source)]);
  });

  it("reports such a line among the properties of a define block", () => {
    const source = `define foo as object with\n  name = "Orion"\n  Hello there.\nend\n`;
    expect(errorsOf(source).map((d) => [d.start!.line, d.message])).toEqual([
      [2, "Incomplete statement: expected assignment or a function call"],
    ]);
  });

  it("reports such a line in a method of a define block", () => {
    const source = `define foo as object with\n  greet(x)\n    Hello there.\n  end\nend\n`;
    expect(errorsOf(source).map((d) => [d.start!.line, d.message])).toEqual([
      [2, "Incomplete statement: expected assignment or a function call"],
    ]);
  });

  it("leaves story lines that begin like a value alone outside Luau code", () => {
    const lines = ["(aside) hi", '"Quoted."', "42 bottles.", "true story.", "{1}", "#1 fan"];
    const body = lines.map((line) => `  ${line}`).join("\n");
    const nested = lines.map((line) => `    ${line}`).join("\n");
    const source = `-> A\n\nscene A\n${body}\n  if true then\n${nested}\n  end\nend\n\n${lines.join("\n")}\n`;
    expect(
      diagnostics(compile(source)).filter((d) => /^Incomplete statement|^Expected/.test(d.message)),
    ).toEqual([]);
  });

  it("reports nothing for a body of Luau statements", () => {
    const source = `store count = 0

function greet(name)
  local greeting = "Hello, " .. name .. "."
  display(greeting)
  print("greeted", name)
  count = count + 1
  if count > 1 then
    display("Again.")
  end
  for i = 1, 2 do
    print(i)
  end
  return greeting
end

function noop()
end

function describe(t)
  local a = t.a
  t.b = a
  t:method()
  greet "x"
  greet "x" greet "y"
  pcall(function() print(a) end)
  return a
end

{greet("Bob")}
`;
    expect(diagnostics(compile(source))).toEqual([]);
  });
});

describe("an `=` that ends its line in Luau code (#1158)", () => {
  // As in Luau, the value is on the next line.
  it("gives a declaration the values on the next line", () => {
    const source = [
      "store sizes = { breadth = 2, components = 3 }",
      "",
      "function f(t)",
      "  local breadth, components =",
      "    t.breadth, t.components",
      "  local x =",
      "    breadth + components",
      "  return x",
      "end",
      "",
      "{f(sizes)}",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual(["5\n"]);
  });

  it.each(["a and b", "a or b", "not a", "a, not b"])(
    "gives a declaration the value %j on the next line",
    (value) => {
      const source = `function f(a, b)\n  local x, y =\n    ${value}\n  return x\nend\n`;
      expect(errorsOf(source)).toEqual([]);
    },
  );

  it("gives a reassignment the values on the next line", () => {
    const source = [
      "function f()",
      "  local a, b = 1, 2",
      "  a, b =",
      "    b, a",
      "  local c = 0",
      "  c =",
      "    a * 10 + b",
      "  return c",
      "end",
      "",
      "{f()}",
      "",
    ].join("\n");
    expect(errorsOf(source)).toEqual([]);
    expect(playedLines(source)).toEqual(["21\n"]);
  });

  it("leaves a narrative reassignment at its line, so the story line after it plays", () => {
    const source = [
      "store x = 0",
      "",
      "-> A",
      "",
      "scene A",
      "  x =",
      "  Hello there.",
      "  done",
      "end",
      "",
    ].join("\n");
    expect(errorsOf(source).map((d) => [d.start!.line, d.message])).toEqual([
      [5, "Expected identifier when parsing expression, got 'Hello'"],
    ]);
    expect(playedLines(source)).toEqual(["Hello there.\n"]);
  });

  it("still reports an `=` whose next line starts a statement", () => {
    const source = "function f()\n  local x =\n  return x\nend\n";
    expect(errorsOf(source).map((d) => d.message)).toEqual([
      "Expected identifier when parsing expression, got 'return'",
    ]);
  });
});

describe("an edit after a line whose error names the next token (#1158)", () => {
  // Each check reads past its line, across blank and comment lines, to the
  // next token, and names it or reports at it. An edit on those lines must
  // leave the validations a cold parse gives, after earlier edits in the
  // block have given the parser places to restart inside it.
  const ANNOTATORS = ["implicits", "references", "compilations", "validations", "declarations"];

  const position = (text: string, offset: number) => {
    const before = text.slice(0, offset).split("\n");
    return { line: before.length - 1, character: before[before.length - 1]!.length };
  };

  function validations(registry: SparkdownDocumentRegistry) {
    const found: string[] = [];
    const iter = (registry.annotations(URI) as any).validations.iter(0);
    while (iter.value) {
      found.push(`${iter.from}-${iter.to} ${iter.value.type.message}`);
      iter.next();
    }
    return found;
  }

  function open(text: string) {
    const registry = new SparkdownDocumentRegistry(ANNOTATORS as never);
    registry.add({ textDocument: { uri: URI, text, version: 1, languageId: "sparkdown" } });
    return registry;
  }

  it.each([
    ["a line that is not a statement", "  Well, friend."],
    ["a `.` no name follows", "  local x = t."],
    ["an if condition no `then` follows", "  if x"],
  ])("keeps %s reported as a cold parse reports it", (_, line) => {
    const scenes = Array.from({ length: 6 }, (_, s) => `scene s${s}\n  Line ${s} here.\nend\n`);
    let text = `${scenes.join("\n")}\nfunction f(t, x)\n  local a = 1\n${line}\n\n  local b = 2\nend\n`;
    const registry = open(text);
    let version = 2;
    const edits: ((text: string) => [number, number, string])[] = [
      (t) => [t.indexOf("local a = 1") + 10, 0, "1"],
      (t) => [t.indexOf("local b = 2") + 10, 0, "2"],
      (t) => [t.indexOf("\n\n  local b") + 1, 0, "  y = 3\n"],
      (t) => [t.indexOf("  y = 3\n"), 8, ""],
      (t) => [t.indexOf("\n\n  local b") + 1, 0, "  -- a note\n"],
      (t) => [t.indexOf("  -- a note\n"), 0, "  z = 4\n"],
    ];
    for (const edit of edits) {
      const [offset, removed, inserted] = edit(text);
      registry.update({
        textDocument: { uri: URI, version: version++ },
        contentChanges: [
          { range: { start: position(text, offset), end: position(text, offset + removed) }, text: inserted },
        ],
      } as never);
      text = text.slice(0, offset) + inserted + text.slice(offset + removed);
      const cold = open(text);
      expect(registry.tree(URI)!.toString(), JSON.stringify(inserted)).toBe(cold.tree(URI)!.toString());
      expect(validations(registry), JSON.stringify(inserted)).toEqual(validations(cold));
    }
  });
});
