// A function body is Luau. A line there that is not a Luau statement
// (`Hello there.`, `Hi, Bob`, a lone `Hello`) is reported once, with Luau's
// parser's first error for it and its range, and its names get the warnings
// Luau's type checker gives them; the function still ends at its own `end`
// (#1158).
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
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

  it("reports a comma list ending with a `.` at the `.`, as a Sparkdown access path", () => {
    // Luau reports the `end` after the `.`; Sparkdown's dangling-access
    // check reports the `.` itself (`LuauDanglingAccessor`).
    expect(errorsOf(inBody("Well, friend."))).toEqual([
      {
        message: "Expected identifier, got 'end'",
        severity: 1,
        start: { line: 1, character: 14 },
        end: { line: 1, character: 15 },
      },
    ]);
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

  it("still reports an `=` whose next line starts a statement", () => {
    const source = "function f()\n  local x =\n  return x\nend\n";
    expect(errorsOf(source).map((d) => d.message)).toEqual([
      "Expected identifier when parsing expression, got 'return'",
    ]);
  });
});
