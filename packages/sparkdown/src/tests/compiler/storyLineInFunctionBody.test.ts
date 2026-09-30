// Story lines are not allowed in a function body, which is read as Luau. A
// line of words there is reported as Luau's parser reports it, once, at its
// first word, instead of as unknown globals or a dangling `.` at its end; and
// the function still ends at its own `end` (#1158).
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";

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

describe("a story line in a function body (#1158)", () => {
  it.each(LINES)("reports %j once, at its first word", (line, word) => {
    expect(errorsOf(script(line))).toEqual([
      incomplete(1, 2, word),
      incomplete(2, 2, "How"),
    ]);
  });

  it.each(LINES)("reports no unknown globals for the words of %j", (line) => {
    const warnings = diagnostics(compile(script(line))).filter(
      (d) => d.severity === 2,
    );
    expect(warnings).toEqual([]);
  });

  it("reports a story line after a statement in the body", () => {
    const source = `function greet()\n  local x = 1\n  Hello there.\n  return x\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 2, "Hello")]);
  });

  it("reports a story line in a block inside the body", () => {
    const source = `function greet(n)\n  if n > 1 then\n    Hello there.\n  end\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 4, "Hello")]);
  });

  it("reports a story line among the properties of a define block", () => {
    const source = `define foo as object with\n  name = "Orion"\n  Hello there.\nend\n`;
    expect(errorsOf(source)).toEqual([incomplete(2, 2, "Hello")]);
  });

  it("reports a story line in a method of a define block", () => {
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
