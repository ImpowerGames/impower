// A Luau block (function, type function, `if`, `do`, `while`, `for`,
// `repeat`) that never reaches its own `end` must be reported on the header of
// the block left open, as Luau reports `Expected 'end' (to close 'function' at
// line 4)`. Without it the unclosed block runs on to the next `end` word, the
// next `scene` / `branch` or the end of the file, the lines it takes in never
// display, and the only diagnostics are unknown-global warnings on the words
// of those lines. See issue #1059.
import "../../inkjs/engine/Container";
import { describe, expect, test } from "vitest";
import { SparkdownCompiler } from "../../compiler/classes/SparkdownCompiler";
import { Story } from "../../inkjs/engine/Story";

interface Diag {
  message: string;
  severity: number;
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

function compile(source: string): { diags: Diag[]; output: string } {
  const uri = "inmemory:///main.sd";
  const compiler = new SparkdownCompiler();
  compiler.configure({
    files: [
      {
        uri,
        type: "script",
        name: "main",
        ext: "sd",
        text: source,
        version: 1,
        languageId: "sparkdown",
      },
    ],
  });
  const result = compiler.compile({ textDocument: { uri } });
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(
    result.program.diagnostics ?? {},
  )) {
    for (const d of docDiagnostics as any[]) {
      diags.push({
        message: typeof d.message === "string" ? d.message : d.message?.value,
        severity: d.severity,
        startLine: d.range?.start?.line,
        startCharacter: d.range?.start?.character,
        endLine: d.range?.end?.line,
        endCharacter: d.range?.end?.character,
      });
    }
  }
  let output = "";
  if (result.program.compiled) {
    const story = new Story(result.program.compiled as any);
    output = story.ContinueMaximally();
  }
  return { diags, output };
}

const MISSING_END = "missing its closing `end`";

const missingEndErrors = (diags: Diag[]) =>
  diags.filter((d) => d.severity === 1 && d.message.includes(MISSING_END));

const TAIL = ["", "Hello there.", "done", ""];

describe("Luau block without `end`", () => {
  test.each([
    ["a function body", ["function f()", "  local a = 1"]],
    [
      "a function whose `end` closes an `if`",
      ["function f()", "  if true then", "    local a = 1", "end"],
    ],
    [
      "a function whose `end` closes a `do`",
      ["function f()", "  do", "    local a = 1", "end"],
    ],
    [
      "a function whose `end` closes a `while`",
      ["function f()", "  while false do", "    local a = 1", "end"],
    ],
    [
      "a function whose `end` closes a `for`",
      ["function f()", "  for i = 1, 2 do", "    local a = 1", "end"],
    ],
    [
      "a function whose `end` closes a type function",
      [
        "function f()",
        "  type function F(t)",
        "    return t",
        "  local a = 1",
        "end",
      ],
    ],
  ])("%s is an error on the function header", (_label, lines) => {
    const { diags } = compile([...lines, ...TAIL].join("\n"));
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
    expect(errs[0]!.message).toContain("function");
  });

  test("a function with no `end` at the end of the file is an error", () => {
    const { diags } = compile(["function f()", "  local a = 1", ""].join("\n"));
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
  });

  test("an `end` for each block closes them in order", () => {
    const { diags } = compile(
      [
        "function f()",
        "  if true then",
        "    local a = 1",
        "  local b = 2",
        "end",
        "end",
        "",
        "scene main",
        "  Hello there.",
        "end",
        "",
      ].join("\n"),
    );
    // The first `end` closes the `if` and the second the function, so nothing
    // is left open.
    expect(missingEndErrors(diags)).toHaveLength(0);
  });

  test("a narrative `end` does not close the function", () => {
    const { diags } = compile(
      [
        "function f()",
        "  local a = 1",
        "",
        "The end of the scene.",
        "done",
        "",
      ].join("\n"),
    );
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
  });

  test("an unclosed function before a scene is an error", () => {
    const { diags } = compile(
      [
        "function f()",
        "  local a = 1",
        "",
        "scene main",
        "  Hello there.",
        "end",
        "",
      ].join("\n"),
    );
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
  });

  test.each([
    ["`if` block", ["if true then", "  Hello."]],
    ["`do` block", ["do", "  Hello."]],
    ["`while` loop", ["while false do", "  Hello."]],
    ["`for` loop", ["for i = 1, 2 do", "  Hello."]],
    ["type function", ["type function F(t)", "  return t"]],
  ])(
    "an unclosed top-level %s before a scene is an error on its header",
    (kind, lines) => {
      const { diags } = compile(
        [...lines, "", "scene main", "  Hi.", "end", ""].join("\n"),
      );
      const errs = missingEndErrors(diags);
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
      expect(errs[0]!.message).toContain(`This ${kind} is missing`);
    },
  );

  test("an unclosed block nested in a scene is reported on its own line", () => {
    const { diags } = compile(
      [
        "scene main",
        "  function g()",
        "    local a = 1",
        "  Hi.",
        "end",
        "",
      ].join("\n"),
    );
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({
      startLine: 1,
      startCharacter: 2,
      endLine: 1,
      endCharacter: 14,
    });
  });

  test("a `repeat` with no `until` is an error on the `repeat`", () => {
    const { diags } = compile(
      [
        "function f()",
        "  repeat",
        "    local a = 1",
        "end",
        "",
        "Hello there.",
        "done",
        "",
      ].join("\n"),
    );
    const errs = diags.filter(
      (d) => d.severity === 1 && d.message.includes("missing its closing"),
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`repeat` loop");
    expect(errs[0]!.message).toContain("`until`");
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test("the narrative `end` is quoted in the message", () => {
    const { diags } = compile(
      ["function f()", "  local a = 1", "The end of it.", ""].join("\n"),
    );
    const errs = missingEndErrors(diags);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`The end`");
  });

  test("an `end` after a statement on the same line closes the block", () => {
    const { diags } = compile(
      [
        "function f()",
        "  local a = 1 end",
        "function g()",
        "  for i = 1, 2 do break end",
        "  print(1) end",
        "",
        "Hello there.",
        "done",
        "",
      ].join("\n"),
    );
    expect(missingEndErrors(diags)).toEqual([]);
  });

  test("well-formed blocks report nothing and still display", () => {
    const { diags, output } = compile(
      [
        "& f()",
        "After the call.",
        "",
        "function f()",
        "  if true then",
        "    local a = 1",
        "  end",
        "  do",
        "    local b = 2",
        "  end",
        "  while false do",
        "    local c = 3",
        "  end",
        "  for i = 1, 2 do",
        "    local d = i",
        "  end",
        "  repeat",
        "    local e = 1",
        "  until true",
        "  type function F(t)",
        "    return t",
        "  end",
        "end",
        "",
        "Closing line.",
        "done",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    expect(output).toContain("After the call.");
    expect(output).toContain("Closing line.");
  });
});
