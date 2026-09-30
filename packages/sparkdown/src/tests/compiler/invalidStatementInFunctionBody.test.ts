// A function body is Luau. A line there that is not a Luau statement
// (`Hello there.`) is reported once, with Luau's parser's first error for it,
// and its names get the warnings Luau's type checker gives them; the function
// still ends at its own `end` (#1158).
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
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

const errorsOf = (source: string) =>
  diagnostics(compile(source)).filter((d) => d.severity === 1);

const byPosition = (a: Found, b: Found) =>
  a.start!.line - b.start!.line || a.start!.character - b.start!.character;

const warningsOf = (source: string) =>
  diagnostics(compile(source))
    .filter((d) => d.severity === 2)
    .sort(byPosition);

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

// Luau's parser's wording for a statement that is only an expression.
const MESSAGE = "Incomplete statement: expected assignment or a function call";

/** The error Luau gives a line of words whose first word is `word`, at `line`:`character`. */
const incomplete = (line: number, character: number, word: string) => ({
  message: MESSAGE,
  severity: 1,
  start: { line, character },
  end: { line, character: character + word.length },
});

/** The ticket's script with `line` as the first line of the body. */
const script = (line: string) =>
  `function greet()\n  ${line}\n  How are you?\nend\n\nscene A\n  Line one.\n  done\nend\n`;

// Each line, with the first word Luau reports it at.
const LINES: [string, string][] = [
  ["Hello there.", "Hello"],
  ["Hello there, friend.", "Hello"],
  ["salt and pepper.", "salt"],
  ["I will return tomorrow.", "I"],
  ["Hello there", "Hello"],
];

describe("a line in a function body that is not a Luau statement (#1158)", () => {
  it.each(LINES)("reports %j once, at its first word", (line, word) => {
    expect(errorsOf(script(line))).toEqual([
      incomplete(1, 2, word),
      incomplete(2, 2, "How"),
    ]);
  });

  it.each(LINES)(
    "gives the words of %j the warnings Luau gives them",
    (line) => {
      const source = `function greet()\n  ${line}\n  How are you?\nend\n`;
      const warnings = warningsOf(source);
      expect(warnings.length).toBeGreaterThan(0);
      expect(warnings).toEqual(luauWarningsOf(source));
    },
  );

  // A line that is not a name then another word, alone in a body
  // before its `end`, with Luau's first error for it: the message, and the
  // text the error covers, found from `at` on the line. Luau reads a name
  // after a `,` as the next target of an assignment and names the token
  // after the targets; where that token is on a later line, the error stays
  // on this line, at the last target. A `.` with no name after it is
  // reported at the `.`.
  it.each([
    ["Hello!", MESSAGE, "Hello"],
    ["Yes?", MESSAGE, "Yes"],
    ["Mr.Smith waves.", MESSAGE, "Mr.Smith"],
    ["U.S. is big.", MESSAGE, "U.S. is"],
    ["Hello.", "Expected identifier, got 'end'", ".", 5],
    ["U.S.", "Expected identifier, got 'end'", ".", 3],
    ["Well, friend.", "Expected identifier, got 'end'", ".", 12],
    ["Hi, Bob", "Expected '=' when parsing assignment, got 'end'", "Bob"],
    [
      "Hello, friend. How are you?",
      "Expected '=' when parsing assignment, got 'are'",
      "are",
    ],
    [
      "Yes, 5 times.",
      "Expected identifier when parsing expression, got '5'",
      "5",
    ],
  ] as [string, string, string, number?][])(
    "reports %j once, with Luau's first error for it",
    (line, message, text, at) => {
      const source = `function greet()\n  ${line}\nend\n`;
      const character = 2 + (at ?? line.indexOf(text));
      expect(errorsOf(source)).toEqual([
        {
          message,
          severity: 1,
          start: { line: 1, character },
          end: { line: 1, character: character + text.length },
        },
      ]);
      expect(warningsOf(source)).toEqual(luauWarningsOf(source));
    },
  );

  it("reports a `.` with no name after it, before a line of names, as a Sparkdown access path", () => {
    // Luau would read the next line's first word as the member.
    const source = `function greet()\n  Hello.\n  How are you?\nend\n`;
    expect(errorsOf(source)[0]).toMatchObject({
      message: expect.stringMatching(/^Expected identifier after '\.' on the same line/),
      start: { line: 1, character: 7 },
      end: { line: 1, character: 8 },
    });
  });

  it("leaves a lone name alone, since Sparkdown reads it as a call", () => {
    const source = `function greet()\n  Hello\nend\n`;
    expect(errorsOf(source)).toEqual([]);
  });

  it("leaves a multiple assignment alone", () => {
    const source = `function swap(a, b)\n  a, b = b, a\n  return a, b\nend\n`;
    expect(errorsOf(source)).toEqual([]);
  });

  it("reports such a line after a statement in the body", () => {
    const source = `function greet()\n  local x = 1\n  Hello there.\n  return x\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 2, "Hello")]);
  });

  it("reports such a line in a block inside the body", () => {
    const source = `function greet(n)\n  if n > 1 then\n    Hello there.\n  end\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 4, "Hello")]);
  });

  it("reports such a line among the properties of a define block", () => {
    const source = `define foo as object with\n  name = "Orion"\n  Hello there.\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 2, "Hello")]);
  });

  it("reports such a line in a method of a define block", () => {
    const source = `define foo as object with\n  greet(x)\n    Hello there.\n  end\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 4, "Hello")]);
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
