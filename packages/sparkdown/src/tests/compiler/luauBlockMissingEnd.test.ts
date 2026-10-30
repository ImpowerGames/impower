import { beforeAll, describe, expect, test } from "vitest";
import { testCompiler, testStory } from "../engineUnderTest";
import { loadOfficialLuau } from "./officialLuau";

let official: Awaited<ReturnType<typeof loadOfficialLuau>>;
beforeAll(async () => {
  official = await loadOfficialLuau("typecheck");
});

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

const lineStarts = (diags: Diag[]) =>
  diags
    .map((d) => [d.startLine, d.message.split(" ")[0]!] as [number, string])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

const proseWarnings = (diags: Diag[]) =>
  diags.filter(
    (d) =>
      d.severity === 2 && d.message.startsWith("The text after this `end`"),
  );

const missingEndErrors = (diags: Diag[]) =>
  diags.filter(
    (d) =>
      d.severity === 1 &&
      d.message.startsWith("This ") &&
      d.message.includes(MISSING_END),
  );

const luauEndErrors = (diags: Diag[]): [number, string][] =>
  diags
    .filter((d) => d.severity === 1 && d.message.startsWith("Expected 'end' (to close "))
    .map((d) => [d.startLine, d.message] as [number, string])
    .sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1]));

const officialEndMessages = (luau: string): string[] =>
  official(luau)
    .diagnostics.map((e) => e.message)
    .filter((message) => message.startsWith("Expected 'end' (to close "))
    .sort();

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
    expectLuauEndError([...lines, ...TAIL].join("\n"), lines.length + 2);
  });

  test("a function whose `end` closes a type function is left open, beside Luau's error at the type function", () => {
    const lines = ["function f()", "  type function F(t)", "    return t", "  local a = 1", "end"];
    const { diags } = compile([...lines, ...TAIL].join("\n"));
    expect(missingEndErrors(diags)).toEqual([]);
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
        "  local function g()",
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
    expect(luauEndErrors(diags)).toEqual([[3, "Expected 'end' (to close 'function' at line 2), got <eof>"]]);
  });

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
        "  local function g()",
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
      "scene start\n  & ok = (function() repeat local a = 5 until a - 4 < 0 or a - 4 >= 0 end)()\nend\n",
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
  });

  test("a `repeat` with no `until` before its function's `end` is Luau's error at that `end`", () => {
    const source = [
      "function f()",
      "  repeat",
      "    local a = 1",
      "end",
      "",
      "scene start",
      "  Hello there.",
      "  done",
      "end",
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
    const { diags } = compile(
      [
        "store total = 0",
        "",
        "scene start",
        "  local function bump()",
        "    total = total + 1",
        "  end bump()",
        "",
        "  Closing line.",
        "end",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    const warnings = proseWarnings(diags);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]!.message).toContain("`bump()`");
  });

  test("a bare call before a same-line `end` closes the block", () => {
    const { diags, output } = compile(
      [
        "function doThing()",
        "  local a = 1",
        "end",
        "",
        "function f()",
        "  doThing end",
        "",
        "scene start",
        "  & f()",
        "  After the call.",
        "  Closing line.",
        "  done",
        "end",
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
    ["an assignment", "end b = 2"],
  ])(
    "a root-level block's `end` followed by %s on its line closes it",
    (_label, endLine) => {
      const { diags } = compile(
        ["store x = 0", "if true then", "  a = 1", endLine, ""].join(
          "\n",
        ),
      );
      expect(missingEndErrors(diags)).toEqual([]);
    },
  );

  test("a misread `end` followed by code and closed by a later `end` is not an error", () => {
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
    ["`while` loop", ["while false do", "  a = 1"]],
    ["`for` loop", ["for i = 1, 2 do", "  a = 1"]],
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
    const errs = compile(
      [
        "scene start",
        "  local function g()",
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
      "scene start",
      "  Hello there.",
      "  done",
      "end",
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
        "function f()",
        "  repeat",
        "    Hello there.",
        "  until true",
        "end",
        "",
        "scene start",
        "  & f()",
        "  After the call.",
        "  Closing line.",
        "  done",
        "end",
      ],
    ],
    [
      "in a function in a scene",
      [
        "scene start",
        "  local function f()",
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
      "scene start",
      "  Closing line.",
      "  done",
      "end",
      "",
    ].join("\n");
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
    [
      "at the end of the file",
      ["scene start", "end", "", "store f = function()", "  local x = 1"],
    ],
    [
      "before a scene",
      [
        "store f = function()",
        "  local x = 1",
        "",
        "scene start",
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
      const line = lines.indexOf("store f = function()");
      expect(errs).toHaveLength(1);
      expect(errs[0]!.message).toContain("This function is missing");
      expect(errs[0]).toMatchObject({ startLine: line, endLine: line });
    },
  );

  test("a function value closed by its `end` is not an error", () => {
    const { diags } = compile(
      [
        "store f = function()",
        "  local x = 1",
        "end",
        "",
        "scene start",
        "  Hi.",
        "end",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
  });

  test.each([
    ["`while` loop", "while false do"],
    ["`for` loop", "for i = 1, 2 do"],
    ["`for` loop", "for k, v in pairs({}) do"],
  ])(
    "text after a %s's `end` in a scene is a warning, not an error",
    (kind, header) => {
      const { diags } = compile(
        ["scene start", `  ${header}`, "    x = 1", "  end of story.", "end", ""].join("\n"),
      );
      expect(diags.filter((d) => d.severity === 1)).toEqual([]);
      const warnings = proseWarnings(diags);
      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatchObject({ startLine: 3, endLine: 3 });
      expect(warnings[0]!.message).toContain(`the ${kind} above it`);
    },
  );

  test("a `repeat` in a scene whose story body is closed by `end` is missing its `until`", () => {
    const errs = compile(
      [
        "scene start",
        "  repeat",
        "    This is repeated story text.",
        "end",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("`until`");
    expect(errs[0]).toMatchObject({ startLine: 1, endLine: 1 });
  });

  test("a closed block whose `end` begins a line of text in a scene is a warning", () => {
    const { diags } = compile(
      [
        "scene start",
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
    expect(warnings[0]).toMatchObject({ startLine: 3, endLine: 3 });
    expect(warnings[0]!.message).toContain("`of story.`");
  });

  test("a function that takes a branch's `end` inside a scene leaves the scene without one", () => {
    const errs = compile(
      [
        "scene start",
        "  Hi.",
        "",
        "branch one",
        "  local function f()",
        "    local a = 1",
        "  Text here.",
        "  done",
        "end",
        "end",
        "",
      ].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(lineStarts(errs)).toEqual([
      [0, "Scene"],
      [6, "Expected"],
      [6, "Incomplete"],
      [6, "Incomplete"],
    ]);
  });

  test("an unclosed block inside a `repeat` in a scene closed by its `until` is the only error", () => {
    const errs = compile(
      ["scene start", "  repeat", "    if true then", "      Hi.", "  until true", "", "  Closing line.", "  done", "end", ""].join("\n"),
    ).diags.filter((d) => d.severity === 1);
    expect(errs).toHaveLength(1);
    expect(errs[0]!.message).toContain("This `if` block is missing");
    expect(errs[0]).toMatchObject({ startLine: 2, endLine: 2 });
  });

  test("an unclosed `if` inside a `repeat` in a function reports its blocks as it does with any Luau line", () => {
    const source = (line: string) =>
      ["function f()", "  repeat", "    if true then", `      ${line}`, "  until true", "end", "", "scene start", "  Closing line.", "  done", "end", ""].join("\n");
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
        "function g()",
        "  repeat local z = 1 until true",
        "  if true then local b = 1 end",
        "  do local c = 2 end",
        "  while false do local d = 3 end",
        "  for i = 1, 2 do local e = i end",
        "end",
        "",
        "scene start",
        "  & g()",
        "  After the call.",
        "  Closing line.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    expect(output).toContain("Closing line.");
  });

  test("well-formed blocks report nothing and still display", () => {
    const { diags, output } = compile(
      [
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
        "scene start",
        "  & f()",
        "  After the call.",
        "  Closing line.",
        "  done",
        "end",
        "",
      ].join("\n"),
    );
    expect(diags.filter((d) => d.severity === 1)).toEqual([]);
    expect(output).toContain("After the call.");
    expect(output).toContain("Closing line.");
  });
});
