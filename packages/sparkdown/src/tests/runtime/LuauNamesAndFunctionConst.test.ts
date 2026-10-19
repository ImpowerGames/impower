// Names and `const` inside function bodies follow Luau (#1319).
//
// - Only Luau's own keywords are reserved as names (#1292): the ink-era words
//   (`var`, `temp`, `const`, `include`, `scene`, ...) are valid Luau names for
//   a local, a parameter, a function and a table key.
// - A `const` inside a function or block is a block-scoped binding that
//   cannot be reassigned, as in Luau (#1293): it takes several names, shadows
//   and is shadowed, belongs to its own function and takes any value. A
//   top-level `const` stays the story's published constant.

import { describe, expect, test } from "vitest";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function run(source: string) {
  const ctx = makeRuntimeStoryFromSource(source);
  return {
    errors: [...ctx.errorMessages],
    text: ctx.story.Continue(),
  };
}

// The ink-era words the reserved list held that Luau allows as names.
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

// No longer reserved either, but the grammar still reads them as Sparkdown's
// `define` and `store` declarations where a value or a statement begins
// (GRAMMAR_GAP_BUG), so the function loses its `end` or its value.
const GRAMMAR_GAP = ["define", "store"];
const GRAMMAR_GAP_BUG = "ImpowerGames/impower-internal#1328";

const POSITIONS: [string, (word: string) => string, string][] = [
  ["a local", (word) => `Go {f()}.\nfunction f()\n  local ${word} = 1\n  return ${word}\nend\n`, "Go 1.\n"],
  ["a parameter", (word) => `Go {f(2)}.\nfunction f(${word})\n  return ${word}\nend\n`, "Go 2.\n"],
  [
    "a local function's name",
    (word) => `Go {f()}.\nfunction f()\n  local function ${word}()\n    return 3\n  end\n  return ${word}()\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second name of a local's list",
    (word) => `Go {f()}.\nfunction f()\n  local a, ${word} = 1, 2\n  return a + ${word}\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second name of a const's list",
    (word) => `Go {f()}.\nfunction f()\n  const a, ${word} = 1, 2\n  return a + ${word}\nend\n`,
    "Go 3.\n",
  ],
  [
    "the second parameter",
    (word) => `Go {f(1, 2)}.\nfunction f(a, ${word})\n  return a + ${word}\nend\n`,
    "Go 3.\n",
  ],
  [
    "a generic for's second variable",
    (word) => `Go {f()}.\nfunction f()\n  local n = 0\n  for _, ${word} in ipairs({1, 2}) do\n    n = n + ${word}\n  end\n  return n\nend\n`,
    "Go 3.\n",
  ],
  [
    "a table key",
    (word) => `Go {f()}.\nfunction f()\n  local t = {${word} = 4}\n  t.${word} = t.${word} + 1\n  return t.${word}\nend\n`,
    "Go 5.\n",
  ],
];

describe("an ink-era word is a valid Luau name (#1292)", () => {
  test("the reported script compiles and runs", () => {
    const { errors, text } = run(
      [
        "Go {f()}.",
        "function f()",
        "  local var = 1",
        "  local temp = 2",
        "  return var + temp",
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

describe.skip(`\`define\` and \`store\` as Luau names (grammar gap, ${GRAMMAR_GAP_BUG})`, () => {
  for (const [position, source, expected] of POSITIONS) {
    test.each(GRAMMAR_GAP)(`\`%s\` as ${position}`, (word) => {
      const { errors, text } = run(source(word));
      expect(errors).toEqual([]);
      expect(text).toBe(expected);
    });
  }
});

describe("names in a list (#1292)", () => {
  test("ink-era words as names together, a const among them", () => {
    const { errors, text } = run(
      [
        "Go {scene(5)}.",
        "function scene(include)",
        "  local var = {temp = include}",
        "  const branch, const = var.temp, 2",
        "  do",
        "    const branch = 3",
        "  end",
        "  return branch + const",
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
      `Go {f()}.\nfunction f()\n  ${keyword} a,\n    scene = 1, 2\n  return a + scene\nend\n`,
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.\n");
  });

  // The tree begins a `const` declaration at `const` on the next line, and
  // the reading ends the list before it (`STATEMENT_BREAKS`), so the missing
  // binding is reported rather than the program silently reading nil. Luau
  // reads `const` there as the next name: GRAMMAR_GAP_BUG.
  test("a list continued with `const` on the next line reports its missing name", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Go {f()}.\nfunction f()\n  local a,\n    const = 1, 2\n  return 1\nend\n",
    );
    expect([...ctx.errorMessages]).toEqual([
      "Expected identifier when parsing binding name, got 'const'",
    ]);
  });

  // The lowerer reads these as Luau where the type checker does not, so the
  // name after the comma is the reading's binding there too (round 2).
  test.each([
    [
      "a function value in an interpolation",
      "Go {(function() local a, const = 1, 2; return a + const end)()}.\n",
    ],
    [
      "a define's method",
      "define box as thing with\n  sum()\n    local a, const = 1, 2\n    return a + const\n  end\nend\nGo.\n",
    ],
    [
      "a define's method declaring a const",
      "define box as thing with\n  sum()\n    const a, const = 1, 2\n    return a + const\n  end\nend\nGo.\n",
    ],
    [
      "a define's function-valued property",
      "define box as thing with\n  sum = function()\n    local a, const = 1, 2\n    return a + const\n  end\nend\nGo.\n",
    ],
    [
      "a Sparkle handler",
      "store g = 0\nlayout form with\n  button \"Go\" @click={ local a, const = 1, 2 g = a + const }\nend\nValue {g}.\n",
    ],
    ["a store", "store a, const = 1, 2\nGo {a + const}.\n"],
  ])("%s takes a name after the comma", (_label, source) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect(
      [...ctx.errorMessages].filter((m) => m.includes("when parsing binding name")),
    ).toEqual([]);
  });

  test("a comment between the comma and the name", () => {
    const { errors, text } = run(
      "Go {f()}.\nfunction f()\n  local a, --[[ next ]] const = 1, 2\n  return a + const\nend\n",
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
        `Go {f()}.\nfunction f()\n  local ${word} = 1\n  return 1\nend\n`,
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
      "Go {run()}.\nfunction run()\n  const X, Y, Z = 1, 2, 3\n  return X\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("a const shadows an earlier one", () => {
    const { errors, text } = run(
      'Go {run()}.\nfunction run()\n  const X = "huh"\n  const X = 3.14\n  local y = X\n  return y\nend\n',
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 3.14.\n");
  });

  test("a const takes a value known only when the function runs", () => {
    const { errors, text } = run(
      "Go {run({fn = 1})}.\nfunction run(f)\n  const thevalue = f.fn\n  return thevalue\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("two functions each have their own const of one name", () => {
    const { errors, text } = run(
      "Go {a()} {b()}.\nfunction a()\n  const X = 1\n  return X\nend\nfunction b()\n  const X = 2\n  return X\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1 2.\n");
  });

  test("a const ends with its block", () => {
    const { errors, text } = run(
      "Go {run()}.\nfunction run()\n  local X = 1\n  do\n    const X = 2\n  end\n  return X\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1.\n");
  });

  test("a function value captures a const", () => {
    const { errors, text } = run(
      "Go {run()}.\nfunction run()\n  const X = 7\n  local get = function() return X end\n  return get()\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 7.\n");
  });

  test("a const does not hide a story const of its name outside the function", () => {
    const { errors, text } = run(
      "const X = 1\nGo {run()} {X}.\nfunction run()\n  const X = 2\n  return X\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 2 1.\n");
  });

  test("a call that returns fewer values than names leaves the rest nil", () => {
    const { errors, text } = run(
      "Go {run()}.\nfunction run()\n  local function two()\n    return 1, 2\n  end\n  const X, Y, Z = two()\n  return X .. \":\" .. Y .. \":\" .. tostring(Z)\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 1:2:nil.\n");
  });

  test.each([
    ["a const", "const"],
    ["a local", "local"],
  ])("%s with more values than names still evaluates every value", (_label, keyword) => {
    const { errors, text } = run(
      `Go {f()}.\nfunction f()\n  local t = {n = 0}\n  local function bump()\n    t.n += 1\n    return 2\n  end\n  ${keyword} x = 1, bump()\n  return x + t.n\nend\n`,
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 2.\n");
  });

  test.each([
    ["more names than values", "const X, Y, Z = 42, 13"],
    ["no value", "const X"],
  ])("%s reports Luau's missing initializer", (_label, line) => {
    const { errors } = run(
      `Go {run()}.\nfunction run()\n  ${line}\n  return 1\nend\n`,
    );
    expect(errors).toEqual(["Missing initializer in const declaration"]);
  });

  test.each([
    ["an assignment", "X = 2"],
    ["a compound assignment", "X += 2"],
    ["one of several targets", "local y\n  y, X = 2, 3"],
  ])("%s to it reports Luau's reassignment error", (_label, line) => {
    const { errors } = run(
      `Go {run()}.\nfunction run()\n  const X = 1\n  ${line}\n  return X\nend\n`,
    );
    expect(errors).toEqual([
      "Variable 'X' is constant and may not be reassigned",
    ]);
  });
});

// The type checker reads a function's body, and reports Luau's const errors
// there; the lowerer reports them where it does not read the Luau. Each is
// reported once, in Luau's words (round 2).
describe("a function's `const` errors in every place Luau is read", () => {
  const REASSIGNED = "Variable 'a' is constant and may not be reassigned";
  const MISSING = "Missing initializer in const declaration";
  test.each([
    ["a function", "Go {f()}.\nfunction f()\n  const a = 1\n  a = 2\n  return a\nend\n", REASSIGNED],
    ["a function value in an interpolation", "Go {(function() const a = 1; a = 2; return a end)()}.\n", REASSIGNED],
    ["a function value in an interpolation, with a value missing", "Go {(function() const a, b = 1; return a end)()}.\n", MISSING],
    ["a define's method", "define box as thing with\n  sum()\n    const a = 1\n    a = 2\n    return a\n  end\nend\nGo.\n", REASSIGNED],
    ["a define's function-valued property", "define box as thing with\n  sum = function()\n    const a = 1\n    a = 2\n    return a\n  end\nend\nGo.\n", REASSIGNED],
    ["a Sparkle handler", "store g = 0\nlayout form with\n  button \"Go\" @click={ const a = 1 a = 2 g = a }\nend\nValue {g}.\n", REASSIGNED],
    ["a function statement over the const", "Go {f()}.\nfunction f()\n  const a = 1\n  function a() end\n  return 1\nend\n", REASSIGNED],
  ])("in %s", (_label, source, message) => {
    const ctx = makeRuntimeStoryFromSource(source);
    expect([...ctx.errorMessages]).toEqual([message]);
  });

  test("a Sparkle handler's const is a local of the handler, not a story constant", () => {
    const ctx = makeRuntimeStoryFromSource(
      "store g = 0\nlayout form with\n  button \"Go\" @click={ const a, b = 1, 2 g = a + b }\nend\nconst a = 5\nValue {g} {a}.\n",
    );
    expect([...ctx.errorMessages]).toEqual([]);
    expect(ctx.story.Continue()).toBe("Value 0 5.\n");
  });
});

describe("a `const` inside a function is linted as a local", () => {
  test("an unused one is reported as Luau's linter reports a local", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Go {run()}.\nfunction run()\n  const X = 1\n  return 2\nend\n",
    );
    expect([...ctx.errorMessages]).toEqual([]);
    expect([...ctx.warningMessages]).toContain(
      "Variable 'X' is never used; prefix with '_' to silence",
    );
  });

  test("a read of it uses it, not the local it shadows", () => {
    const ctx = makeRuntimeStoryFromSource(
      "Go {run()}.\nfunction run()\n  local X = 1\n  const X = 2\n  return X\nend\n",
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
      "const X = 5\nGo {run()}.\nfunction run()\n  return X\nend\n",
    );
    expect(errors).toEqual([]);
    expect(text).toBe("Go 5.\n");
  });

  test("several names report the one-name rule", () => {
    const { errors } = run("const X, Y = 1, 2\nGo {X}.\n");
    expect(errors).toEqual(["A `const` takes one name and one value"]);
  });

  test("a value that is not constant is reported", () => {
    const { errors } = run(
      "store s = 1\nconst X = s\nGo {X}.\n",
    );
    expect(errors.some((m) => m.includes("must be initialized to a constant expression"))).toBe(true);
  });

  test("a reassignment inside a function reports the compiler's error", () => {
    const { errors } = run(
      "const X = 5\nGo {run()}.\nfunction run()\n  X = 6\n  return X\nend\n",
    );
    expect(errors).toEqual(["Cannot re-assign the const `X`."]);
  });

  test("a second const of one name with another value is reported", () => {
    const { errors } = run("const X = 1\nconst X = 2\nGo {X}.\n");
    expect(errors.some((m) => m.startsWith("Cannot redeclare const `X`"))).toBe(true);
  });
});
