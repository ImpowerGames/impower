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
  const diags = readDiags(result.program);
  let output = "";
  if (result.program.compiled) {
    const story = new Story(result.program.compiled as any);
    output = story.ContinueMaximally();
  }
  return { diags, output };
}

function readDiags(program: {
  diagnostics?: Record<string, unknown[]>;
}): Diag[] {
  const diags: Diag[] = [];
  for (const docDiagnostics of Object.values(program.diagnostics ?? {})) {
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
  return diags;
}

const MISSING_END = "missing its closing `end`";

const proseWarnings = (diags: Diag[]) =>
  diags.filter(
    (d) =>
      d.severity === 2 && d.message.startsWith("The text after this `end`"),
  );

// This check's errors, leaving out the scene and branch `end` checks' own.
const missingEndErrors = (diags: Diag[]) =>
  diags.filter(
    (d) =>
      d.severity === 1 &&
      d.message.startsWith("This ") &&
      d.message.includes(MISSING_END),
  );

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

  test("a narrative `end` that closes the function is a warning on its line", () => {
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
    expect(missingEndErrors(diags)).toEqual([]);
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ startLine: 3, endLine: 3 });
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

  test("an unclosed function in a scene is reported on its own line", () => {
    const { diags } = compile(
      [
        "scene main",
        "  function g()",
        "    local a = 1",
        "  Hi.",
        "",
        "scene other",
        "  Yo.",
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

  // A story line in a function's body stops the function's node there, and
  // the rest of the body follows as chunks of its own, which a root-level
  // `end` closes.
  test.each([
    [
      "a function whose body holds story lines",
      ["function greet", "  Hello there.", "  How are you?", "end"],
    ],
    [
      "an `if` with story lines inside a function",
      ["function f()", "  if true then", "    Hi there.", "  end", "end"],
    ],
    [
      "a function with story lines inside a scene",
      [
        "scene main",
        "  function g()",
        "    Hi there.",
        "  end",
        "  done",
        "end",
      ],
    ],
  ])("%s closed by its own `end` is not an error", (_label, lines) => {
    const { diags } = compile(
      [...lines, "", "scene A", "  Line one.", "end", ""].join("\n"),
    );
    expect(missingEndErrors(diags)).toEqual([]);
  });

  test.each([
    [
      "the end of the file",
      ["function greet", "  Hello there.", "  How are you?", ""],
    ],
    [
      "a scene",
      [
        "function greet",
        "  Hello there.",
        "",
        "scene A",
        "  Line one.",
        "end",
        "",
      ],
    ],
  ])(
    "a function whose body holds story lines and reaches %s without `end` is an error",
    (_label, lines) => {
      const errs = missingEndErrors(compile(lines.join("\n")).diags);
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
    },
  );

  test("an `if` and a function with story lines, one `end` short, report the function", () => {
    const errs = missingEndErrors(
      compile(
        ["function f()", "  if true then", "    Hi there.", "  end", ""].join(
          "\n",
        ),
      ).diags,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
    expect(errs[0]!.message).toContain("This function");
  });

  test("typing and deleting a later `end` updates the error", () => {
    // The function's chunk is unchanged by both edits, so only a check over
    // the whole document sees the `end` arrive and leave.
    const uri = "inmemory:///main.sd";
    const compiler = new SparkdownCompiler();
    compiler.configure({
      files: [
        {
          uri,
          type: "script",
          name: "main",
          ext: "sd",
          text: [
            "function greet",
            "  Hello there.",
            "  How are you?",
            "",
            "Tail.",
            "",
          ].join("\n"),
          version: 1,
          languageId: "sparkdown",
        },
      ],
    });
    const errorCount = () =>
      missingEndErrors(
        readDiags(compiler.compile({ textDocument: { uri } }).program),
      ).length;
    const edit = (version: number, endCharacter: number, text: string) =>
      compiler.updateDocument({
        textDocument: { uri, version },
        contentChanges: [
          {
            range: {
              start: { line: 3, character: 0 },
              end: { line: 3, character: endCharacter },
            },
            text,
          },
        ],
      });
    expect(errorCount()).toBe(1);
    edit(2, 0, "end");
    expect(errorCount()).toBe(0);
    edit(3, 3, "");
    expect(errorCount()).toBe(1);
  });

  test("a `repeat` whose `until` the grammar reads inside its body is not an error", () => {
    const { diags } = compile(
      "local ok = (function() repeat local a = 5 until a - 4 < 0 or a - 4 >= 0 end)()\n",
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
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

  test("the text after a narrative `end` is quoted in the warning", () => {
    const { diags } = compile(
      ["function f()", "  local a = 1", "The end of it.", ""].join("\n"),
    );
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("`of it.`");
    expect(warnings[0]!.message).toContain("the function above it");
  });

  test("a call after a block's own `end` is a warning, not an error", () => {
    // The grammar reads `bump()` after the function's `end` as a line of
    // text, which displays rather than runs.
    const { diags } = compile(
      [
        "store total = 0",
        "",
        "function bump()",
        "  total = total + 1",
        "end bump()",
        "",
        "Closing line.",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("`bump()`");
  });

  test("a bare call before a same-line `end` closes the block", () => {
    // A bare name is a statement, a call of that name, so the `end` after it
    // is the function's own.
    const { diags, output } = compile(
      [
        "& f()",
        "After the call.",
        "",
        "function doThing()",
        "  local a = 1",
        "end",
        "",
        "function f()",
        "  doThing end",
        "",
        "Closing line.",
        "done",
        "",
      ].join("\n"),
    );
    expect(missingEndErrors(diags)).toEqual([]);
    expect(output).toContain("Closing line.");
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

  test.each([
    ["spaces", "end   "],
    ["a `//` comment", "end // note"],
    ["a divert", "end -> DONE"],
    ["an explicit statement", "end & x = 1"],
    ["a local", "end local b = 2"],
  ])(
    "a root-level block's `end` followed by %s on its line closes it",
    (_label, endLine) => {
      const { diags } = compile(
        ["store x = 0", "if true then", "  local a = 1", endLine, ""].join(
          "\n",
        ),
      );
      expect(missingEndErrors(diags)).toEqual([]);
    },
  );

  test("a misread `end` followed by code and closed by a later `end` is not an error", () => {
    // The grammar does not read `if {}` as an `if` block, so the function
    // takes the `if`'s `end`, and `assert(…)` follows as a line of text; the
    // last `end` closes the function.
    const { diags } = compile(
      [
        "function run()",
        '  local r if {} then r = 1 else r = 2 end assert(r == 1, "got " .. tostring(r))',
        "end",
        "",
      ].join("\n"),
    );
    expect(missingEndErrors(diags)).toEqual([]);
  });

  test.each([
    ["`while` loop", ["while false do", "  local a = 1"]],
    ["`for` loop", ["for i = 1, 2 do", "  local a = 1"]],
    ["`while` loop", ["while false do", "  Hello."]],
  ])(
    "an unclosed top-level %s at the end of the file is an error on its header",
    (kind, lines) => {
      const errs = missingEndErrors(
        compile([...lines, "", "Hello there.", "done", ""].join("\n")).diags,
      );
      expect(errs).toHaveLength(1);
      expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
      expect(errs[0]!.message).toContain(`This ${kind} is missing`);
    },
  );

  test("a function that takes its scene's `end` is reported with the scene", () => {
    const errs = missingEndErrors(
      compile(
        [
          "scene main",
          "  function g()",
          "    local a = 1",
          "  Hi there.",
          "end",
          "",
        ].join("\n"),
      ).diags,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
    expect(errs[0]!.message).toContain("This function or the scene around it");
  });

  test("a `repeat` with no `until` around one that has its own is an error", () => {
    const errs = compile(
      [
        "function f()",
        "  repeat",
        "    repeat",
        "      local a = 1",
        "    until true",
        "  local b = 2",
        "end",
        "",
        "Hello there.",
        "done",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1 && d.message.includes("`until`"));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test.each([
    [
      "in a function",
      [
        "& f()",
        "After the call.",
        "",
        "function f()",
        "  repeat",
        "    Hello there.",
        "  until true",
        "end",
        "",
        "Closing line.",
        "done",
      ],
    ],
    [
      "in a function in a scene",
      [
        "-> main",
        "",
        "scene main",
        "  function f()",
        "    repeat",
        "      local a = 1",
        "      Hello there.",
        "    until true",
        "  end",
        "  Bye.",
        "  done",
        "end",
      ],
    ],
  ])(
    "a `repeat` with a story line in its body %s is closed by its `until`",
    (_label, lines) => {
      const { diags } = compile([...lines, ""].join("\n"));
      expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    },
  );

  test("a `repeat` cut off by a story line and never closed is an error", () => {
    const errs = compile(
      [
        "function f()",
        "  repeat",
        "    Hello there.",
        "end",
        "",
        "Closing line.",
        "done",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1 && d.message.includes("`until`"));
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test("a closed block whose `end` begins a line of text in a scene is not an error", () => {
    const { diags } = compile(
      [
        "-> main",
        "",
        "scene main",
        "  if true then",
        "    local a = 1",
        "  end of story.",
        "  Bye.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
  });

  test("a function that takes a branch's `end` inside a scene is reported", () => {
    const errs = missingEndErrors(
      compile(
        [
          "-> main.one",
          "",
          "scene main",
          "  Hi.",
          "",
          "branch one",
          "  function f()",
          "    local a = 1",
          "  Text here.",
          "  done",
          "end",
          "end",
          "",
        ].join("\n"),
      ).diags,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 6, endLine: 6 });
  });

  test("an unclosed block inside a top-level `repeat` is an error", () => {
    const errs = missingEndErrors(
      compile(
        [
          "repeat",
          "  if true then",
          "    Hi.",
          "until true",
          "",
          "Closing line.",
          "done",
          "",
        ].join("\n"),
      ).diags,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test("a line of text beginning with `end` closes the function with a warning", () => {
    const { diags } = compile(
      [
        "function f()",
        "  local a = 1",
        "end of the day.",
        "Bye.",
        "done",
        "",
      ].join("\n"),
    );
    expect(missingEndErrors(diags)).toEqual([]);
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("`of the day.`");
  });

  test("one-line blocks report nothing", () => {
    const { diags, output } = compile(
      [
        "& g()",
        "After the call.",
        "",
        "function g()",
        "  repeat local z = 1 until true",
        "  if true then local b = 1 end",
        "  do local c = 2 end",
        "  while false do local d = 3 end",
        "  for i = 1, 2 do local e = i end",
        "end",
        "",
        "Closing line.",
        "done",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    expect(output).toContain("Closing line.");
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
