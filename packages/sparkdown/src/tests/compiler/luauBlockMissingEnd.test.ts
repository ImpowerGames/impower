// A Luau block (function, type function, `if`, `do`, `while`, `for`,
// `repeat`) that never reaches its own `end` must be reported. Without it the
// unclosed block runs on to the next `end` word, the next `scene` / `branch`
// or the end of the file, the lines it takes in never display, and the only
// diagnostics are unknown-global warnings on the words of those lines. See
// issue #1059. In a `.sd` function's own Luau the report is Luau's
// `Expected 'end' (to close 'function' at line 4)`, at Luau's range, and
// nothing on the block's header (I-1322, the maintainer's decision); a block
// in story is reported on its header.
import { beforeAll, describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { loadOfficialLuau } from "./officialLuau";

let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => {
  official = await loadOfficialLuau("typecheck");
});

/** The official parser's errors for the Luau a script begins with (its lines before the first blank line), as `[line, message]`. */
const officialErrors = (source: string): [number, string][] =>
  official(source.slice(0, source.indexOf("\n\n") + 1))
    .diagnostics.map((e) => [e.location.begin.line, e.message] as [number, string])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

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
  const compiler = testCompiler();
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
  if (result.program.chunks) {
    const story = testStory(result.program.chunks);
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

// Each diagnostic's line and the first word of its message, in line order.
const lineStarts = (diags: Diag[]) =>
  diags
    .map((d) => [d.startLine, d.message.split(" ")[0]!] as [number, string])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

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

// Luau's errors for a block left open, `Expected 'end' (to close ...)`, as
// `[line, message]`.
const luauEndErrors = (diags: Diag[]): [number, string][] =>
  diags
    .filter((d) => d.severity === 1 && d.message.startsWith("Expected 'end' (to close "))
    .map((d) => [d.startLine, d.message] as [number, string])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

/** The official parser's `Expected 'end' (to close ...)` messages for some Luau. */
const officialEndMessages = (luau: string): string[] =>
  official(luau)
    .diagnostics.map((e) => e.message)
    .filter((message) => message.startsWith("Expected 'end' (to close "))
    .sort();

/**
 * A `.sd` function left open is Luau's error alone: no Sparkdown report on
 * its header, and Luau's `Expected 'end'` messages for the Luau it holds
 * (`luau`, the whole source by default), at the line `line` names.
 */
function expectLuauEndError(source: string, line: number, luau = source): void {
  const { diags } = compile(source);
  expect(missingEndErrors(diags)).toEqual([]);
  const errs = luauEndErrors(diags);
  expect(errs.map(([, message]) => message).sort()).toEqual(officialEndMessages(luau));
  expect(errs.map(([at]) => at)).toContain(line);
}

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
  ])("%s is Luau's error where the function's `end` is missing", (_label, lines) => {
    // The story lines after it are the function's Luau (#1158), so Luau
    // meets the end of the input after `done`.
    expectLuauEndError([...lines, ...TAIL].join("\n"), lines.length + 2);
  });

  // Unlike Luau's parser, the reading does not end a block at its `return`
  // (TYPECHECK.md): the type function takes the `end`, as the tree does, so
  // the function is left open, beside Luau's own error at `local`.
  test("a function whose `end` closes a type function is left open, beside Luau's error at the type function", () => {
    const lines = ["function f()", "  type function F(t)", "    return t", "  local a = 1", "end"];
    const { diags } = compile([...lines, ...TAIL].join("\n"));
    expect(missingEndErrors(diags)).toEqual([]);
    // Luau ends the type function at that error, after its `return`, so
    // the `end` closes `f` and the end of input is the chunk's (I-1430).
    expect(luauEndErrors(diags)).toEqual([[3, "Expected 'end' (to close 'function' at line 2), got 'local'"]]);
    expect(officialEndMessages(lines.join("\n"))).toEqual(["Expected 'end' (to close 'function' at line 2), got 'local'"]);
  });

  test("a function with no `end` at the end of the file is Luau's error", () => {
    expectLuauEndError(["function f()", "  local a = 1", ""].join("\n"), 1);
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

  test("an unclosed function before a scene is Luau's error at the end of its Luau", () => {
    // The function's Luau ends before the scene, where Luau meets its end.
    expectLuauEndError(
      ["function f()", "  local a = 1", "", "scene main", "  Hello there.", "end", ""].join("\n"),
      1,
      ["function f()", "  local a = 1", ""].join("\n"),
    );
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

  test("an unclosed function in a scene is Luau's error, naming the function's line", () => {
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
    expect(missingEndErrors(diags)).toEqual([]);
    // `Hi.` is a line of the function's Luau (#1158), after which Luau meets
    // the end of the function's input before the next scene.
    expect(luauEndErrors(diags)).toEqual([[3, "Expected 'end' (to close 'function' at line 2), got <eof>"]]);
  });

  // A line in a function's body that is not a Luau statement (`Hello
  // there.`) is reported on its own, and the function's `end` still closes
  // the function.
  test.each([
    [
      "a function whose body holds lines that are not Luau statements",
      ["function greet", "  Hello there.", "  How are you?", "end"],
    ],
    [
      "an `if` holding a line that is not a Luau statement inside a function",
      ["function f()", "  if true then", "    Hi there.", "  end", "end"],
    ],
    [
      "a function holding a line that is not a Luau statement inside a scene",
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
      2,
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
      1,
    ],
  ])(
    "a function whose body holds lines that are not Luau statements and reaches %s without `end` is Luau's error",
    (_label, lines, line) => {
      // `function greet` with no parameter list is Sparkdown's own header,
      // so the official parser's reading of it is not the function's; the
      // function left open is Luau's error where its Luau ends.
      const { diags } = compile(lines.join("\n"));
      expect(missingEndErrors(diags)).toEqual([]);
      expect(luauEndErrors(diags)).toEqual([[line, "Expected 'end' (to close 'function' at line 1), got <eof>"]]);
    },
  );

  test("an `if` and a function holding a line that is not a Luau statement, one `end` short, report the function", () => {
    const source = ["function f()", "  if true then", "    Hi there.", "  end", ""].join("\n");
    expectLuauEndError(source, 3);
    expect(luauEndErrors(compile(source).diags)).toEqual([
      [3, "Expected 'end' (to close 'function' at line 1), got <eof>; did you forget to close 'then' at line 2?"],
    ]);
  });

  test("typing and deleting a later `end` updates the error", () => {
    // The function's chunk is unchanged by both edits, so only a check over
    // the whole document sees the `end` arrive and leave.
    const uri = "inmemory:///main.sd";
    const compiler = testCompiler();
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
    // Luau's error for the function left open, the only report of it.
    const errorCount = () => {
      const diags = readDiags(compiler.compile({ textDocument: { uri } }).program);
      expect(missingEndErrors(diags)).toEqual([]);
      return luauEndErrors(diags).length;
    };
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

  // The `end` a `repeat` meets before its `until` closes the block around
  // the loop, as Luau reads it (#1906): the loop is left without its
  // `until`, and Luau's error is at that `end`, not on the loop's line.
  test("a `repeat` with no `until` before its function's `end` is Luau's error at that `end`", () => {
    const source = [
      "function f()",
      "  repeat",
      "    local a = 1",
      "end",
      "",
      "Hello there.",
      "done",
      "",
    ].join("\n");
    const errs = compile(source).diags.filter((d) => d.severity === 1);
    expect(errs.map((d) => [d.startLine, d.message])).toEqual(officialErrors(source));
    expect(errs).toContainEqual(
      expect.objectContaining({ startLine: 3, message: "Expected 'until' (to close 'repeat' at line 2), got 'end'" }),
    );
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

  test("a function that takes its scene's `end` leaves the scene without one", () => {
    // `Hi there.` is a line of the function's body, as any Luau line is
    // (#1158), so the `end` closes the function and the scene is left open.
    // Luau reports the line as it reads it: `Hi` is not a statement, the
    // `.` after `there` has no name before the `end` (#1175), and
    // `there.` is no statement either (I-1322).
    const errs = compile(
      [
        "scene main",
        "  function g()",
        "    local a = 1",
        "  Hi there.",
        "end",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(lineStarts(errs)).toEqual([
      [0, "Scene"],
      [3, "Incomplete"],
      [3, "Incomplete"],
      [4, "Expected"],
    ]);
    expect(errs.find((d) => d.startLine === 0)!.message).toContain("missing its closing `end`");
  });

  test("a `repeat` with no `until` around one that has its own is Luau's error", () => {
    const source = [
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
    ].join("\n");
    const errs = compile(source).diags.filter((d) => d.severity === 1);
    expect(errs.map((d) => [d.startLine, d.message])).toEqual(officialErrors(source));
    expect(errs).toContainEqual(
      expect.objectContaining({ startLine: 6, message: "Expected 'until' (to close 'repeat' at line 2), got 'end'" }),
    );
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
    "a `repeat` holding a line that is not a Luau statement %s is closed by its `until`",
    (_label, lines) => {
      // The line is reported on its own as Luau reads it (#1158, #1175): `Hello`
      // is not a statement, nor is `there.` (I-1322), and the `.` has no
      // name before the `until`.
      const { diags } = compile([...lines, ""].join("\n"));
      expect(lineStarts(diags.filter((d) => d.severity === 1))).toEqual([
        [lines.findIndex((l) => l.includes("Hello")), "Incomplete"],
        [lines.findIndex((l) => l.includes("Hello")), "Incomplete"],
        [lines.findIndex((l) => l.includes("until")), "Expected"],
      ]);
    },
  );

  test("a `repeat` holding a line that is not a Luau statement and no `until` reports Luau's errors", () => {
    const source = [
      "function f()",
      "  repeat",
      "    Hello there.",
      "end",
      "",
      "Closing line.",
      "done",
      "",
    ].join("\n");
    // Luau's errors for the line, every one (I-1322): `Hello` and `there.`
    // are no statements, and the `end` that does not close the `repeat` is
    // where the line's name is missing and the `until` too.
    const errs = compile(source).diags.filter((d) => d.severity === 1).map((d) => [d.startLine, d.message]);
    expect(errs).toHaveLength(4);
    expect(errs).toEqual(expect.arrayContaining([
      [2, "Incomplete statement: expected assignment or a function call"],
      [3, "Expected 'until' (to close 'repeat' at line 2), got 'end'"],
      [3, "Expected identifier, got 'end'"],
    ]));
    expect(officialErrors(source)).toEqual(expect.arrayContaining(errs));
  });

  test.each([
    ["at the end of the file", ["store f = function()", "  local x = 1"]],
    [
      "before a scene",
      [
        "store f = function()",
        "  local x = 1",
        "",
        "scene main",
        "  Hi.",
        "end",
      ],
    ],
  ])(
    "a function value with no `end` %s is an error on its line",
    (_label, lines) => {
      const errs = compile([...lines, ""].join("\n")).diags.filter(
        (d) => d.severity === 1,
      );
      expect(errs).toHaveLength(1);
      expect(errs[0]!.message).toContain("This function is missing");
      expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
    },
  );

  test("a function value closed by its `end` is not an error", () => {
    const { diags } = compile(
      ["store f = function()", "  local x = 1", "end", "", "Hi.", ""].join(
        "\n",
      ),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
  });

  test.each([
    ["`while` loop", "while false do"],
    ["`for` loop", "for i = 1, 2 do"],
    ["`for` loop", "for k, v in pairs({}) do"],
  ])(
    "text after a top-level %s's `end` is a warning, not an error",
    (kind, header) => {
      const { diags } = compile(
        [header, "  local x = 1", "end of story.", ""].join("\n"),
      );
      expect(diags.filter((d) => d.severity === 1)).toEqual([]);
      const warnings = proseWarnings(diags);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ startLine: 2, endLine: 2 });
      expect(warnings[0]!.message).toContain(`the ${kind} above it`);
    },
  );

  test("a top-level `repeat` whose story body is closed by `end` is missing its `until`", () => {
    const errs = compile(
      [
        "repeat",
        "  This is repeated story text.",
        "end",
        "Afterward.",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`until`");
    expect(errs[0]).toMatchObject({ startLine: 0, endLine: 0 });
  });

  test("a closed block whose `end` begins a line of text in a scene is a warning", () => {
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
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ startLine: 5, endLine: 5 });
    expect(warnings[0]!.message).toContain("`of story.`");
  });

  test("a function that takes a branch's `end` inside a scene leaves the scene without one", () => {
    // `Text here.` is a line of the function's body, as any Luau line is
    // (#1158), so the function and the branch take the two `end`s. `Text` is
    // not a statement, which is Luau's first error for the line; Luau reads
    // `done` on the next line as the name after the `.`, which a Sparkdown
    // access path cannot, reported at the `.`.
    const errs = compile(
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
    ).diags.filter((d) => d.severity === 1);
    expect(lineStarts(errs)).toEqual([
      [2, "Scene"],
      [8, "Expected"],
      [8, "Incomplete"],
      [8, "Incomplete"],
    ]);
  });

  test("an unclosed block inside a top-level `repeat` closed by its `until` is the only error", () => {
    const errs = compile(
      ["repeat", "  if true then", "    Hi.", "until true", "", "Closing line.", "done", ""].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("This `if` block is missing");
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test("an unclosed `if` inside a `repeat` in a function reports its blocks as it does with any Luau line", () => {
    // `Hi.` is a line of the `if`'s body, as `local y = 1` would be (#1158).
    // The `until` closes the `if` and goes to the `repeat`, as Luau reads it
    // (#1209), so either line gets Luau's errors, at Luau's places, every
    // one (I-1322): after `Hi.` the `until` is where the name is missing
    // and the `if`'s `end` too.
    const source = (line: string) =>
      ["function f()", "  repeat", "    if true then", `      ${line}`, "  until true", "end", "", "Closing line.", "done", ""].join("\n");
    const errors = (text: string) =>
      compile(text)
        .diags.filter((d) => d.severity === 1)
        .map((d) => [d.startLine, d.message] as [number, string]);
    const plain = source("local y = 1");
    expect(errors(plain)).toEqual([[4, "Expected 'end' (to close 'then' at line 3), got 'until'"]]);
    expect(errors(plain)).toEqual(officialErrors(plain));
    const story = source("Hi.");
    expect(errors(story)).toEqual(expect.arrayContaining([
      [3, "Incomplete statement: expected assignment or a function call"],
      [4, "Expected 'end' (to close 'then' at line 3), got 'until'"],
      [4, "Expected identifier, got 'until'"],
    ]));
    expect(errors(story)).toHaveLength(3);
    expect(officialErrors(story)).toEqual(expect.arrayContaining(errors(story)));
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
