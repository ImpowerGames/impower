import { describe, expect, test } from "vitest";
import { dumpTree, stripAnsi } from "../compiler/grammarSnapshot";
import { collectDiagnostics, makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  return {
    errors: [...ctx.errorMessages],
    text: ctx.story.Continue(),
  };
}

const INK_WORDS = [
  "var",
  "temp",
  "VAR",
  "const",
  "CONST",
  "include",
  "INCLUDE",
  "external",
  "EXTERNAL",
  "DEFINE",
  "system",
  "scene",
  "branch",
];

const STRUCTURAL_WORDS = ["define", "store"];

const POSITIONS: [string, (word: string) => string, string][] = [
  ["a local", (word) => `function f()\n  local ${word} = 1\n  return ${word}\nend\nscene start\n  Go {f()}.\nend\n`, "Go 1.\n"],
  ["a parameter", (word) => `function f(${word})\n  return ${word}\nend\nscene start\n  Go {f(2)}.\nend\n`, "Go 2.\n"],
  [
    "a local function's name",
    (word) => `function f()\n  local function ${word}()\n    return 3\n  end\n  return ${word}()\nend\nscene start\n  Go {f()}.\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second name of a local's list",
    (word) => `function f()\n  local a, ${word} = 1, 2\n  return a + ${word}\nend\nscene start\n  Go {f()}.\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second name of a const's list",
    (word) => `function f()\n  const a, ${word} = 1, 2\n  return a + ${word}\nend\nscene start\n  Go {f()}.\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second parameter",
    (word) => `function f(a, ${word})\n  return a + ${word}\nend\nscene start\n  Go {f(1, 2)}.\nend\n`,
    "Go 3.\n",
  ],
  [
    "a generic for's second variable",
    (word) => `function f()\n  local n = 0\n  for _, ${word} in ipairs({1, 2}) do\n    n = n + ${word}\n  end\n  return n\nend\nscene start\n  Go {f()}.\nend\n`,
    "Go 3.\n",
  ],
  [
    "a table key",
    (word) => `function f()\n  local t = {${word} = 4}\n  t.${word} = t.${word} + 1\n  return t.${word}\nend\nscene start\n  Go {f()}.\nend\n`,
    "Go 5.\n",
  ],
];

describe("an ink-era word is a valid Luau name (#1292)", () => {
  test("the reported script compiles and runs", () => {
    const { errors, text } = run(
      [
        "function f()",
        "  local var = 1",
        "  local temp = 2",
        "  return var + temp",
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.\n");
  });

  for (const [position, source, expected] of POSITIONS) {
    test.each(INK_WORDS)(`\`%s\` as ${position}`, (word) => {
      const { errors, text } = run(source(word));
      expect(errors).toEqual([]);
      expect(text).toBe(expected);
    });
  }
});

describe("`define` and `store` as Luau names (#1328)", () => {
  for (const [position, source, expected] of POSITIONS) {
    test.each(STRUCTURAL_WORDS)(`\`%s\` as ${position}`, (word) => {
      const { errors, text } = run(source(word));
      expect(errors).toEqual([]);
      expect(text).toBe(expected);
      expect(collectDiagnostics(source(word))).toEqual({ errorMessages: [], warningMessages: [] });
    });
  }

  test.each(STRUCTURAL_WORDS)("`%s` as a value, a call and an assignment target", (word) => {
    const { errors, text } = run(
      [
        "function f()",
        `  local ${word} = 1`,
        `  ${word} = ${word} + 1`,
        "  local function g() return 2 end",
        `  local t = {${word} = g}`,
        `  return ${word} + t.${word}()`,
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 4.\n");
  });

  test.each(STRUCTURAL_WORDS)("`%s` beginning a line as a table and a function", (word) => {
    const { errors, text } = run(
      [
        "function f()",
        `  local ${word} = {n = 1}`,
        `  ${word}.n = ${word}.n + 1`,
        `  ${word}["n"] = ${word}["n"] + 1`,
        `  return ${word}.n`,
        "end",
        "function g()",
        "  local n = 0",
        `  local function ${word}(k) n = n + k end`,
        `  ${word}(2)`,
        `  ${word} (3)`,
        "  return n",
        "end",
        "scene start",
        "  Go {f()} {g()}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3 5.\n");
  });

  test.each(STRUCTURAL_WORDS)("`%s` as a name before a string, a table or a comment", (word) => {
    const source = [
      "function f()",
      "  local n = 0",
      `  local function ${word}(x) n = n + #x end`,
      `  ${word} "abc"`,
      `  ${word} {1, 2}`,
      `  ${word} --[[ note ]] ("de")`,
      "  return n",
      "end",
      "function g()",
      `  local ${word} = 3`,
      "  return",
      `    ${word}`,
      "end",
      "function h()",
      `  local ${word} = 4`,
      `  return ${word} --[[ note`,
      "  ]]",
      "end",
      "function k()",
      `  local ${word} --[[ note`,
      "  ]] = 5",
      `  return ${word}`,
      "end",
      "scene start",
      "  Go {f()} {g()} {h()} {k()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source)).toEqual({ errorMessages: [], warningMessages: [] });
    expect(run(source)).toEqual({ errors: [], text: "Go 7 3 4 5.\n" });
  });

  test.each(STRUCTURAL_WORDS)("`%s` as a name at column 0 in a function", (word) => {
    const source = [
      "function f()",
      `  local ${word} = 1`,
      "  return",
      `${word}`,
      "end",
      "function g()",
      "  local n = 0",
      `  local function ${word}(x) n = n + #x end`,
      `${word} "abc"`,
      `${word} {1, 2}`,
      "  return n",
      "end",
      "scene start",
      "  Go {f()} {g()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source)).toEqual({
      errorMessages: [],
      warningMessages: ["Statement spans multiple lines; use indentation to silence"],
    });
    expect(run(source)).toEqual({ errors: [], text: "Go 1 5.\n" });
  });

  test("a store and a const after `do` and `then` whose name follows a comment spanning lines", () => {
    const source = [
      "function f()",
      "  local r = 0",
      "  do store --[[ note",
      "      ]] tally = 2",
      "    if tally then const --[[ note",
      "        ]] bonus = 3",
      "      r = tally + bonus",
      "    end",
      "  end",
      "  return r",
      "end",
      "scene start",
      "  Go {f()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source)).toEqual({ errorMessages: [], warningMessages: [] });
    expect(run(source)).toEqual({ errors: [], text: "Go 5.\n" });
  });

  test.each([
    ["after a function's header", "function f() store --[[ note\n  ]] tally = 2\n  return tally\nend\n"],
    ["after a statement on its line", "function f()\n  local a = 0 store --[[ note\n    ]] tally = 2\n  return a + tally\nend\n"],
    ["after a comment", "function f()\n  --[[ first ]] store --[[ note\n    ]] tally = 2\n  return tally\nend\n"],
  ])("a store whose name follows a comment spanning lines %s", (_label, body) => {
    const source = `${body}scene start\n  Go {f()}.\nend\n`;
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 2.\n" });
  });

  test.each(["const", "store"])("`%s` assigned after a comment spanning lines", (word) => {
    const source = [
      "function f()",
      `  local ${word} = 1`,
      `  ${word} --[[ explain the update`,
      "  ]] = 3",
      `  return ${word}`,
      "end",
      "scene start",
      "  Go {f()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 3.\n" });
  });

  test.each([
    ["store", ""],
    ["store", " -- note"],
    ["const", ""],
    ["const", " -- note"],
  ])("a `%s` whose name follows on the next line%s", (word, trailing) => {
    const source = `function f()\n  ${word}${trailing}\n    tally = 2\n  return tally\nend\nscene start\n  Go {f()}.\nend\n`;
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 2.\n" });
  });

  test("`define` assigned after a comment spanning lines", () => {
    const source = [
      "function f()",
      "  local define = 1",
      "  define --[[ note",
      "  ]] = 3",
      "  return define",
      "end",
      "function g()",
      "  local define = {x = 1}",
      "  define --[[ note",
      "  ]] .x = 4",
      "  return define.x",
      "end",
      "scene start",
      "  Go {f()} {g()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 3 4.\n" });
  });

  test.each([
    ["a spaced field", "const .x = 3"],
    ["a spaced index", 'const ["x"] = 3'],
  ])("a table named `const` assigned through %s", (_label, assignment) => {
    const source = `function f()\n  local const = {x=1}\n  ${assignment}\n  return const.x\nend\nscene start\n  Go {f()}.\nend\n`;
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 3.\n" });
  });

  test.each(["a + const", "a + const + 1", "(const)", "const"])(
    "`const` as a declared name and as a value in `return %s` is a name in the tree",
    (body) => {
      const tree = stripAnsi(dumpTree(`function f()\n  local a, const = 1, 2\n  return ${body}\nend\n`));
      const constLines = tree.split("\n").filter((line) => line.endsWith(': "const"'));
      expect(constLines).toHaveLength(2);
      for (const line of constLines) expect(line).toMatch(/LuauVariableName \[\d+\.\.\d+\]: "const"$/);
    },
  );

  test.each(["const", ...STRUCTURAL_WORDS])("`%s` continuing an expression before a comment spanning lines", (word) => {
    const source = [
      "function f()",
      `  local ${word} = 3`,
      "  return",
      `    ${word} --[[ note`,
      "    ]]",
      "end",
      "function g()",
      `  local ${word} = 3`,
      "  return 1 +",
      `    ${word} --[[ note`,
      "    ]]",
      "end",
      "function h()",
      "  local a,",
      `    ${word} --[[ note`,
      "    ]] = 1, 2",
      `  return a + ${word}`,
      "end",
      "scene start",
      "  Go {f()} {g()} {h()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source).errorMessages).toEqual([]);
    expect(run(source)).toEqual({ errors: [], text: "Go 3 4 3.\n" });
  });

  test("a store and a const whose name follows a comment spanning lines", () => {
    const source = [
      "function f()",
      "  store --[[ declaration name",
      "  ]] tally = 2",
      "  const --[[ declaration name",
      "  ]] bonus = 3",
      "  return tally + bonus",
      "end",
      "scene start",
      "  Go {f()}.",
      "end",
      "",
    ].join("\n");
    expect(collectDiagnostics(source)).toEqual({ errorMessages: [], warningMessages: [] });
    expect(run(source)).toEqual({ errors: [], text: "Go 5.\n" });
  });

  test("a store and a define keep their reading before a name", () => {
    const { errors, text } = run(
      [
        "store count = 1",
        "define Box with",
        "  size = 2",
        "end",
        "function f()",
        "  define Inner with",
        "    size = 3",
        "  end",
        "  local b = new Box()",
        "  local c = new Inner()",
        "  return count + b.size + c.size",
        "end",
        "scene start",
        "  Go {f()}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 6.\n");
  });
});

describe("names in a list (#1292)", () => {
  test("ink-era words as names together, a const among them", () => {
    const { errors, text } = run(
      [
        "function scene(include)",
        "  local var = {temp = include}",
        "  const branch, const = var.temp, 2",
        "  do",
        "    const branch = 3",
        "  end",
        "  return branch + const",
        "end",
        "scene start",
        "  Go {scene(5)}.",
        "end",
        "",
      ].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 7.\n");
  });

  test.each([
    ["a local's", "local"],
    ["a const's", "const"],
  ])("%s list continued on the next line takes a name there", (_label, keyword) => {
    const { errors, text } = run(
      `function f()\n  ${keyword} a,\n    scene = 1, 2\n  return a + scene\nend\nscene start\n  Go {f()}.\nend\n`,
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.\n");
  });

  test.each(["const", ...STRUCTURAL_WORDS])(
    "a list continued with `%s` on the next line takes it as the name",
    (word) => {
      const { errors, text } = run(
        `function f()\n  local a,\n    ${word} = 1, 2\n  return a + ${word}\nend\nscene start\n  Go {f()}.\nend\n`,
      );
      expect(errors).toEqual([]);
      expect(text).toBe("Go 3.\n");
    },
  );

  test.each([
    [
      "a function value in an interpolation",
      "scene start\n  Go {(function() local a, const = 1, 2; return a + const end)()}.\nend\n",
    ],
    [
      "a define's method",
      "define box as thing with\n  sum()\n    local a, const = 1, 2\n    return a + const\n  end\nend\nscene start\n  Go.\nend\n",
    ],
    [
      "a define's method declaring a const",
      "define box as thing with\n  sum()\n    const a, const = 1, 2\n    return a + const\n  end\nend\nscene start\n  Go.\nend\n",
    ],
    [
      "a define's function-valued property",
      "define box as thing with\n  sum = function()\n    local a, const = 1, 2\n    return a + const\n  end\nend\nscene start\n  Go.\nend\n",
    ],
    [
      "a Sparkle handler",
      "store g = 0\nlayout form with\n  button \"Go\" @click={ local a, const = 1, 2 g = a + const }\nend\nscene start\n  Value {g}.\nend\n",
    ],
    ["a store", "store a, const = 1, 2\nscene start\n  Go {a + const}.\nend\n"],
  ])("%s takes a name after the comma", (_label, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(
      [...ctx.errorMessages].filter((m) => m.includes("when parsing variable name")),
    ).toEqual([]);
  });

  test("a comment between the comma and the name", () => {
    const { errors, text } = run(
      "function f()\n  local a, --[[ next ]] const = 1, 2\n  return a + const\nend\nscene start\n  Go {f()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.\n");
  });
});

describe("a Luau keyword is still not a name (#1292)", () => {
  test.each(["end", "nil", "true", "local", "until"])(
    "`local %s = 1` is rejected with Luau's message",
    (word) => {
      const { errors } = run(
        `function f()\n  local ${word} = 1\n  return 1\nend\nscene start\n  Go {f()}.\nend\n`,
      );
      expect(errors).toContain(
        `Expected identifier when parsing variable name, got '${word}'`,
      );
    },
  );
});

describe("a `const` inside a function follows Luau (#1293)", () => {
  test("several names take their values", () => {
    const { errors, text } = run(
      "function run()\n  const X, Y, Z = 1, 2, 3\n  return X\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("a const shadows an earlier one", () => {
    const { errors, text } = run(
      'function run()\n  const X = "huh"\n  const X = 3.14\n  local y = X\n  return y\nend\nscene start\n  Go {run()}.\nend\n',
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.14.\n");
  });

  test("a const takes a value known only when the function runs", () => {
    const { errors, text } = run(
      "function run(f)\n  const thevalue = f.fn\n  return thevalue\nend\nscene start\n  Go {run({fn = 1})}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("two functions each have their own const of one name", () => {
    const { errors, text } = run(
      "function a()\n  const X = 1\n  return X\nend\nfunction b()\n  const X = 2\n  return X\nend\nscene start\n  Go {a()} {b()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1 2.\n");
  });

  test("a const ends with its block", () => {
    const { errors, text } = run(
      "function run()\n  local X = 1\n  do\n    const X = 2\n  end\n  return X\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("a function value captures a const", () => {
    const { errors, text } = run(
      "function run()\n  const X = 7\n  local get = function() return X end\n  return get()\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 7.\n");
  });

  test("a const does not hide a story const of its name outside the function", () => {
    const { errors, text } = run(
      "const X = 1\nfunction run()\n  const X = 2\n  return X\nend\nscene start\n  Go {run()} {X}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 2 1.\n");
  });

  test("a call that returns fewer values than names leaves the rest nil", () => {
    const { errors, text } = run(
      "function run()\n  local function two()\n    return 1, 2\n  end\n  const X, Y, Z = two()\n  return X .. \":\" .. Y .. \":\" .. tostring(Z)\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1:2:nil.\n");
  });

  test.each([
    ["a const", "const"],
    ["a local", "local"],
  ])("%s with more values than names still evaluates every value", (_label, keyword) => {
    const { errors, text } = run(
      `function f()\n  local t = {n = 0}\n  local function bump()\n    t.n += 1\n    return 2\n  end\n  ${keyword} x = 1, bump()\n  return x + t.n\nend\nscene start\n  Go {f()}.\nend\n`,
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 2.\n");
  });

  test.each([
    ["more names than values", "const X, Y, Z = 42, 13"],
    ["no value", "const X"],
  ])("%s reports Luau's missing initializer", (_label, line) => {
    const { errors } = run(
      `function run()\n  ${line}\n  return 1\nend\nscene start\n  Go {run()}.\nend\n`,
    );
    expect(errors).toEqual(["Missing initializer in const declaration"]);
  });

  test.each([
    ["an assignment", "X = 2"],
    ["a compound assignment", "X += 2"],
    ["one of several targets", "local y\n  y, X = 2, 3"],
  ])("%s to it reports Luau's reassignment error", (_label, line) => {
    const { errors } = run(
      `function run()\n  const X = 1\n  ${line}\n  return X\nend\nscene start\n  Go {run()}.\nend\n`,
    );
    expect(errors).toEqual([
      "Variable 'X' is constant and may not be reassigned",
    ]);
  });
});

describe("a function's `const` errors in every place Luau is read", () => {
  const REASSIGNED = "Variable 'a' is constant and may not be reassigned";
  const MISSING = "Missing initializer in const declaration";
  test.each([
    ["a function", "function f()\n  const a = 1\n  a = 2\n  return a\nend\nscene start\n  Go {f()}.\nend\n", REASSIGNED],
    ["a function value in an interpolation", "scene start\n  Go {(function() const a = 1; a = 2; return a end)()}.\nend\n", REASSIGNED],
    ["a function value in an interpolation, with a value missing", "scene start\n  Go {(function() const a, b = 1; return a end)()}.\nend\n", MISSING],
    ["a define's method", "define box as thing with\n  sum()\n    const a = 1\n    a = 2\n    return a\n  end\nend\nscene start\n  Go.\nend\n", REASSIGNED],
    ["a define's function-valued property", "define box as thing with\n  sum = function()\n    const a = 1\n    a = 2\n    return a\n  end\nend\nscene start\n  Go.\nend\n", REASSIGNED],
    ["a Sparkle handler", "store g = 0\nlayout form with\n  button \"Go\" @click={ const a = 1 a = 2 g = a }\nend\nscene start\n  Value {g}.\nend\n", REASSIGNED],
    ["a function statement over the const", "function f()\n  const a = 1\n  function a() end\n  return 1\nend\nscene start\n  Go {f()}.\nend\n", REASSIGNED],
    [
      "a nested function value in an interpolation",
      "scene start\n  Go {(function() const a = 1; local f = function() a = 2 end; f(); return a end)()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a nested function value in an interpolation, never called",
      "scene start\n  Go {(function() const a = 1; local f = function() a = 2 end; return a end)()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a function value in a string's interpolation",
      "function f()\n  return \"Value {(function() const a = 1; a = 2; return a end)()}.\"\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a nested function value in a string's interpolation",
      "function f()\n  return \"Value {(function() const a = 1; local g = function() a = 2 end; g(); return a end)()}.\"\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a function value in a string's interpolation, with a value missing",
      "function f()\n  return \"Value {(function() const a, b = 1; return a end)()}.\"\nend\nscene start\n  Go {f()}.\nend\n",
      MISSING,
    ],
    [
      "a string's interpolation reassigning its enclosing function's const",
      "function f()\n  const a = 1\n  return \"Value {(function() a = 2; return a end)()}.\"\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a string's interpolation reassigning its enclosing function's const from a nested function",
      "function f()\n  const a = 1\n  return \"Value {(function() local g = function() a = 2 end; g(); return a end)()}.\"\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a function value in a store's value",
      "store h = function() const a = 1; a = 2; return a end\nscene start\n  Go {h()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a function value in a backtick string's interpolation",
      "function f()\n  return `Value {(function() const a = 1; a = 2; return a end)()}.`\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
    [
      "a nested function in a function",
      "function f()\n  const a = 1\n  local function g()\n    a = 2\n  end\n  g()\n  return a\nend\nscene start\n  Go {f()}.\nend\n",
      REASSIGNED,
    ],
  ])("in %s", (_label, source, message) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect([...ctx.errorMessages]).toEqual([message]);
  });

  test("a Sparkle handler's const is a local of the handler, not a story constant", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store g = 0\nlayout form with\n  button \"Go\" @click={ const a, b = 1, 2 g = a + b }\nend\nconst a = 5\nscene start\n  Value {g} {a}.\nend\n",
    );
    expect([...ctx.errorMessages]).toEqual([]);
    expect(ctx.story.Continue()).toBe("Value 0 5.\n");
  });
});

describe("a function's `const` reassigned from a body read on its own", () => {
  const REASSIGNED = "Variable 'a' is constant and may not be reassigned";
  const fn = (body: string) => `function f()\n${body}\nend\nscene start\n  Go {f()}.\nend\n`;
  test.each([
    ["a define's property", "  const a = 1\n  define box with\n    sum = function() a = 2; return a end\n  end\n  return box.sum()"],
    ["a define's method", "  const a = 1\n  define box with\n    sum()\n      a = 2\n      return a\n    end\n  end\n  return 1"],
    ["a nested function in a define's property", "  const a = 1\n  define box with\n    sum = function() local g = function() a = 2 end; g(); return a end\n  end\n  return 1"],
    ["a nested function in a define's method", "  const a = 1\n  define box with\n    sum()\n      local g = function() a = 2 end\n      g()\n      return a\n    end\n  end\n  return 1"],
    ["a compound assignment in a define's property", "  const a = 1\n  define box with\n    sum = function() a += 2; return a end\n  end\n  return 1"],
  ])("from %s is Luau's error", (_label, body) => {
    const ctx = makeRuntimeStoryFromSource(fn(body));
    expect([...ctx.errorMessages]).toEqual([REASSIGNED]);
  });

  test.each([
    ["an assignment", "a = 2"],
    ["a nested function", "local g = function() a = 2 end g()"],
    ["a local function", "local function g() a = 2 end g()"],
  ])("from %s in a Sparkle handler is Luau's error, once", (_label, handler) => {
    const ctx = makeRuntimeStoryFromSource(
      fn(`  const a = 1\n  layout form with\n    button "Go" @click={ ${handler} }\n  end\n  return a`),
    );
    expect([...ctx.errorMessages]).toEqual([
      "'layout' is a top-level declaration and cannot be written inside a function",
      REASSIGNED,
    ]);
  });

  test.each([
    ["the const declared after the body", "  define box with\n    sum = function() a = 2; return a end\n  end\n  const a = 1\n  return a"],
    ["a local shadowing it in a block", "  const a = 1\n  do\n    local a = 5\n    define box with\n      sum = function() a = 2; return a end\n    end\n  end\n  return a"],
    ["a local shadowing it in a repeat body, through the until", "  const a = 1\n  repeat\n    local a = 0\n    local g = function() a = 2 end\n    g()\n  until a == 2\n  return a"],
    ["a parameter of the body shadowing it", "  const a = 1\n  define box with\n    sum = function(a) a = 2; return a end\n  end\n  return a"],
    ["the block that declared it closed", "  do\n    const a = 1\n  end\n  define box with\n    sum = function() a = 2; return a end\n  end\n  return 1"],
  ])("with %s, is no error", (_label, body) => {
    const ctx = makeRuntimeStoryFromSource(fn(body));
    expect([...ctx.errorMessages].filter((m) => m.includes("constant") || m.includes("const `"))).toEqual([]);
  });

  test.each([
    ["a nested function", "const a = 1\nfunction f()\n  local g = function() a = 2 end\n  return 1\nend\nscene start\n  Go {f()}.\nend\n"],
    ["a define's property in a function", "const a = 1\nfunction f()\n  define box with\n    sum = function() a = 2; return a end\n  end\n  return 1\nend\nscene start\n  Go {f()}.\nend\n"],
  ])("a published const reassigned from %s keeps the compiler's error", (_label, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect([...ctx.errorMessages]).toEqual(["Cannot re-assign the const `a`."]);
  });
});

describe("a function's `const` errors in a function body a type holds", () => {
  const REASSIGNED = "Variable 'a' is constant and may not be reassigned";
  const MISSING = "Missing initializer in const declaration";
  const shapes: [string, string, string][] = [
    ["a type alias reassigning a captured const", "const a = 1; type T = typeof(function() a = 2 end); return 1", REASSIGNED],
    ["a local's annotation reassigning a captured const", "const a = 1; local x: typeof(function() a = 2 end) = nil; return 1", REASSIGNED],
    ["a type alias with a const missing its value", "type T = typeof(function() const b end); return 1", MISSING],
  ];
  const places: [string, (code: string) => string][] = [
    ["a story interpolation", (code) => `scene start\n  Go {(function() ${code} end)()}.\nend\n`],
    ["a double-quoted string's interpolation", (code) => `function f()\n  return "Value {(function() ${code} end)()}."\nend\nscene start\n  Go {f()}.\nend\n`],
    ["a define's property", (code) => `define box with\n  sum = function() ${code} end\nend\nscene start\n  Go.\nend\n`],
    ["a store's function value", (code) => `store h = function() ${code} end\nscene start\n  Go.\nend\n`],
  ];
  for (const [place, wrap] of places) {
    test.each(shapes)(`${place}: %s`, (_label, code, message) => {
      const ctx = makeRuntimeStoryFromSource(wrap(code));
      expect([...ctx.errorMessages]).toEqual([message]);
    });
  }

  const signatureShapes: [string, string, string][] = [
    ["an erased function's parameter type", "type T = typeof(function(x: typeof(function() const b end)) end); return 1", MISSING],
    ["an erased function's return type", "type T = typeof(function(): typeof(function() const b end) end); return 1", MISSING],
    ["an erased function's vararg type", "type T = typeof(function(...: typeof(function() const b end)) end); return 1", MISSING],
    ["a nested erased function's parameter type", "type T = typeof(function() local g = function(x: typeof(function() const b end)) end end); return 1", MISSING],
    ["a type function reassigning its const", "type function tf() const a = 1; a = 2; return nil end; return 1", REASSIGNED],
    ["a type function with a const missing its value", "type function tf() const b; return nil end; return 1", MISSING],
  ];
  for (const [place, wrap] of places.filter(([p]) => p !== "a define's property")) {
    test.each(signatureShapes)(`${place}: %s`, (_label, code, message) => {
      const ctx = makeRuntimeStoryFromSource(wrap(code));
      expect([...ctx.errorMessages]).toEqual([message]);
    });
  }

  test.each(signatureShapes)("a checked function: %s, once", (_label, code, message) => {
    const ctx = makeRuntimeStoryFromSource(`function f()\n  ${code.split("; ").join("\n  ")}\nend\nscene start\n  Go {f()}.\nend\n`);
    expect([...ctx.errorMessages]).toEqual([message]);
  });

  test.each(shapes)("a checked function: %s, once", (_label, code, message) => {
    const ctx = makeRuntimeStoryFromSource(`function f()\n  ${code.split("; ").join("\n  ")}\nend\nscene start\n  Go {f()}.\nend\n`);
    expect([...ctx.errorMessages]).toEqual([message]);
  });
});

describe("a `const` inside a function is linted as a local", () => {
  test("an unused one is reported as Luau's linter reports a local", () => {
    const ctx = makeRuntimeStoryFromSource(
      "function run()\n  const X = 1\n  return 2\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect([...ctx.errorMessages]).toEqual([]);
    expect([...ctx.warningMessages]).toContain(
      "Variable 'X' is never used; prefix with '_' to silence",
    );
  });

  test("a read of it uses it, not the local it shadows", () => {
    const ctx = makeRuntimeStoryFromSource(
      "function run()\n  local X = 1\n  const X = 2\n  return X\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect([...ctx.warningMessages]).toContain(
      "Variable 'X' is never used; prefix with '_' to silence",
    );
    expect(ctx.story.Continue()).toBe("Go 2.\n");
  });
});

describe("a top-level `const` is still the story's published constant", () => {
  test("it is read in every function", () => {
    const { errors, text } = run(
      "const X = 5\nfunction run()\n  return X\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 5.\n");
  });

  test("several names report the one-name rule", () => {
    const { errors } = run("const X, Y = 1, 2\nscene start\n  Go {X}.\nend\n");
    expect(errors).toEqual(["A `const` takes one name and one value"]);
  });

  test("a value that is not constant is reported", () => {
    const { errors } = run(
      "store s = 1\nconst X = s\nscene start\n  Go {X}.\nend\n",
    );
    expect(errors.some((m) => m.includes("must be initialized to a constant expression"))).toBe(true);
  });

  test("a reassignment inside a function reports the compiler's error", () => {
    const { errors } = run(
      "const X = 5\nfunction run()\n  X = 6\n  return X\nend\nscene start\n  Go {run()}.\nend\n",
    );
    expect(errors).toEqual(["Cannot re-assign the const `X`."]);
  });

  test("a second const of one name with another value is reported", () => {
    const { errors } = run("const X = 1\nconst X = 2\nscene start\n  Go {X}.\nend\n");
    expect(errors.some((m) => m.startsWith("Cannot redeclare const `X`"))).toBe(true);
  });
});
