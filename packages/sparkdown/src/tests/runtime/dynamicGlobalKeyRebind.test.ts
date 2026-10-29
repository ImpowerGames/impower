import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { Op } from "../../program/ProgramInstructions";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import {
  coldSurface,
  CONFIG,
  divergence,
  posAt,
  quiet,
  surface,
} from "../program/incrementalOracleHarness";
import {
  compileScript,
  MAIN_URI,
  programCompiler,
  rootChunks,
  storyBeats,
  storyRun,
} from "../program/programHarness";

const outcome = ({ program }: { program: SparkProgram }) => {
  const diagnostics = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1 || d.severity === 2)
    .map((d) => d.message);
  expect(program.chunks).toBeDefined();
  const beats = storyBeats(new ProgramStory(program.chunks!));
  return {
    text: beats.beats.map((b) => b.text).join(""),
    errors: [...diagnostics, ...beats.errors],
  };
};

const inScene = (text: string): string => {
  const lines = text.trimEnd().split("\n");
  const story = lines.findIndex((line) => !line.startsWith("function "));
  return [
    ...lines.slice(0, story),
    "-> start",
    "scene start",
    ...lines.slice(story).map((line) => `  ${line}`),
    "end",
    "",
  ].join("\n");
};

const run = (text: string) => outcome(compileScript(inScene(text)));

const cases: [string, string, string][] = [
  [
    "an index write through _G with a local key rebinds a top-level function",
    "function f() return 7 end\n& local k = 'f'\n& _G[k] = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G with a local key rebinds a top-level function",
    "function f() return 7 end\n& local k = 'f'\n& rawset(_G, k, function() return 2 end)\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G with a literal key rebinds a top-level function",
    "function f() return 7 end\n& rawset(_G, 'f', function() return 2 end)\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "an index write through _G with a computed key rebinds a top-level function",
    "function f() return 7 end\n& local function key() return 'f' end\n& _G[key()] = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a dynamic write through _G inside a function rebinds the global",
    "function f() return 7 end\nfunction swap(k) _G[k] = function() return 3 end end\n& swap('f')\nf is {f()}.\n",
    "f is 3.\n",
  ],
  [
    "a call before the dynamic write runs the original",
    "function f() return 7 end\n& local k = 'f'\nbefore {f()}.\n& _G[k] = function() return 2 end\nafter {f()}.\n",
    "before 7.\nafter 2.\n",
  ],
  [
    "a dynamic write through _G in a multiple assignment rebinds the global",
    "function f() return 7 end\n& local k = 'f'\n& _G[k], x = function() return 2 end, 1\nf is {f()}, x is {x}.\n",
    "f is 2, x is 1.\n",
  ],
  [
    "a dynamic write through _G in a multiple assignment inside a function rebinds the global",
    "function f() return 7 end\nfunction swap(k, x) _G[k], x = function() return 3 end, 1 end\n& swap('f', 0)\nf is {f()}.\n",
    "f is 3.\n",
  ],
  [
    "a literal-key write through _G in a multiple assignment rebinds the global",
    "function f() return 7 end\n& _G.f, x = function() return 2 end, 1\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G among a builtin call's arguments rebinds a top-level function",
    "function f() return 7 end\n& local k = 'f'\n& assert(rawset(_G, k, function() return 2 end))\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G with a literal key among a builtin call's arguments rebinds a top-level function",
    "function f() return 7 end\n& assert(rawset(_G, 'f', function() return 2 end))\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G among another rawset's arguments rebinds a top-level function",
    "function f() return 7 end\n& local k = 'f'\n& rawset({}, 'other', rawset(_G, k, function() return 2 end))\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "rawset on _G in a line's interpolation rebinds a top-level function",
    "function f() return 7 end\n& local k = 'f'\nset {rawset(_G, k, function() return 2 end) ~= nil}.\nf is {f()}.\n",
    "set true.\nf is 2.\n",
  ],
  [
    "a dynamic write of another name leaves the function alone",
    "function f() return 7 end\n& local k = 'g'\n& _G[k] = function() return 2 end\nf is {f()}.\n",
    "f is 7.\n",
  ],
];

const callsThroughVariable = (root: ProgramRoot): boolean => {
  const reader = new BinaryProgramReader(root);
  return rootChunks(root).some((chunk) =>
    [...reader.instructions(chunk)].some((i) => i.op === Op.CallVar),
  );
};

const afterEdit = (script: string, before: string, after: string) => {
  const text = inScene(script);
  const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
  quiet(() => c.compile());
  const at = text.indexOf(before);
  expect(at).toBeGreaterThanOrEqual(0);
  c.compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: { start: posAt(text, at), end: posAt(text, at + before.length) },
        text: after,
      },
    ],
  });
  const compiled = quiet(() => c.compile());
  const edited = text.slice(0, at) + after + text.slice(at + before.length);
  return {
    divergence: divergence(surface(compiled.program), coldSurface(edited)),
    outcome: outcome(compiled),
  };
};

describe("rebinding a top-level function through _G with a dynamic key (I-1394)", () => {
  it.each(cases)("%s", (_name, text, expected) => {
    expect(run(text)).toEqual({ text: expected, errors: [] });
  });

  it.each([
    ["no store through _G", "function f() return 7 end\n& x = 1\nf is {f()}.\n"],
    [
      "a literal-key store of another name",
      "function f() return 7 end\n& _G.g = function() return 2 end\n& _G['h'] = 3\nf is {f()}.\n",
    ],
    [
      "a literal-key rawset of another name",
      "function f() return 7 end\n& rawset(_G, 'g', 2)\nf is {f()}.\n",
    ],
    [
      "a dynamic-key store into another table",
      "function f() return 7 end\n& local t = {}\n& local k = 'f'\n& t[k] = 2\nf is {f()}.\n",
    ],
    [
      "dynamic-key multiple and compound stores into another table",
      "function f() return 7 end\n& local t = {f = 1}\n& local k = 'f'\n& t[k], x = 2, 3\n& t[k] += 1\nf is {f()}.\n",
    ],
    ["a literal key spelling the dynamic store's mark", "function f() return 7 end\n& _G['_G[]'] = 1\nf is {f()}.\n"],
    ["a rawset of a literal key spelling the dynamic store's mark", "function f() return 7 end\n& rawset(_G, '_G[]', 1)\nf is {f()}.\n"],
    ["a literal key spelling a whole table's mark", "function f() return 7 end\n& _G['*vars'] = 1\n& _G['*'] = 1\nf is {f()}.\n"],
  ])("%s keeps the direct call", (_name, text) => {
    const { program } = compileScript(inScene(text));
    expect(outcome({ program })).toEqual({ text: "f is 7.\n", errors: [] });
    expect(callsThroughVariable(program.chunks!)).toBe(false);
  });

  it("a dynamic-key store sends every top-level function's call through its global", () => {
    const { program } = compileScript(
      inScene("function f() return 7 end\nfunction h() return 5 end\n& local k = 'f'\n& _G[k] = function() return 2 end\nf is {f()}, h is {h()}.\n"),
    );
    expect(outcome({ program })).toEqual({ text: "f is 2, h is 5.\n", errors: [] });
    expect(callsThroughVariable(program.chunks!)).toBe(true);
  });

  it("a compound store through _G with a dynamic key sends calls through their globals", () => {
    const { program } = compileScript(
      inScene("function f() return 7 end\n& local k = 'n'\n& n = 1\n& _G[k] += 1\nf is {f()}, n is {n}.\n"),
    );
    expect(outcome({ program })).toEqual({ text: "f is 7, n is 2.\n", errors: [] });
    expect(callsThroughVariable(program.chunks!)).toBe(true);
  });

  const arity = "Function call to `f` requires 1 argument, but got 2";
  const surplus =
    "function f(a) return a end\n& local k = 'z'\n& x = 1\nf is {f(1, 2)}.\n";
  it("a dynamic-key store keeps the check of a call's arguments", () => {
    expect(run(surplus.replace("& x = 1", "& _G[k] = 1"))).toEqual({
      text: "f is 1.\n",
      errors: [expect.objectContaining({ value: arity })],
    });
  });
  it("an edit that adds a dynamic-key store keeps the check of a call's arguments", () => {
    const { divergence: diff, outcome: result } = afterEdit(
      surplus,
      "& x = 1",
      "& _G[k] = 1",
    );
    expect(diff).toBeUndefined();
    expect(result).toEqual({
      text: "f is 1.\n",
      errors: [expect.objectContaining({ value: arity })],
    });
  });

  const direct =
    "function f() return 7 end\n& local k = 'f'\n& x = 1\nf is {f()}.\n";
  const dynamic =
    "function f() return 7 end\n& local k = 'f'\n& _G[k] = function() return 2 end\nf is {f()}.\n";
  const dynamicRawset =
    "function f() return 7 end\n& local k = 'f'\n& rawset(_G, k, function() return 2 end)\nf is {f()}.\n";
  it.each([
    ["adds a dynamic-key store", direct, "& x = 1", "& _G[k] = function() return 2 end", "f is 2.\n"],
    ["removes a dynamic-key store", dynamic, "& _G[k] = function() return 2 end", "& x = 1", "f is 7.\n"],
    ["adds a dynamic-key rawset", direct, "& x = 1", "& rawset(_G, k, function() return 2 end)", "f is 2.\n"],
    ["removes a dynamic-key rawset", dynamicRawset, "& rawset(_G, k, function() return 2 end)", "& x = 1", "f is 7.\n"],
    ["adds a dynamic-key rawset among a builtin call's arguments", direct, "& x = 1", "& assert(rawset(_G, k, function() return 2 end))", "f is 2.\n"],
    ["removes a dynamic-key rawset among a builtin call's arguments", dynamicRawset.replace("& rawset(_G, k, function() return 2 end)", "& assert(rawset(_G, k, function() return 2 end))"), "& assert(rawset(_G, k, function() return 2 end))", "& x = 1", "f is 7.\n"],
    ["makes the store's key a literal of another name", dynamic, "_G[k]", "_G['g']", "f is 7.\n"],
    ["makes a literal key dynamic", dynamic.replace("_G[k]", "_G['g']"), "_G['g']", "_G[k]", "f is 2.\n"],
  ])("an edit that %s compiles as a cold compile does", (_name, text, before, after, expected) => {
    const { divergence: diff, outcome: result } = afterEdit(text, before, after);
    expect(diff).toBeUndefined();
    expect(result).toEqual({ text: expected, errors: [] });
  });

  const filler = (prefix: string) =>
    Array.from({ length: 16 }, (_, i) => `    ${prefix} ${i}.`);
  it.each([
    ["_G[k] = g", "& _G[k] = g", "f is 2."],
    ["rawset(_G, k, g)", "& rawset(_G, k, g)", "f is 2."],
    ["assert(rawset(_G, k, g))", "& assert(rawset(_G, k, g))", "f is 2."],
    ["_G.f = g", "& _G.f = g", "f is 2."],
  ])("edits around a store %s in a memoized block keep the call through the global", (_name, store, expected) => {
    let text = [
      "function f() return 7 end",
      "-> MAIN",
      "scene MAIN",
      "  choose",
      "    + [Go]",
      "      Go.",
      "  then",
      "    Warm line.",
      "    & local k = 'f'",
      "    & local g = function() return 2 end",
      ...filler("Filler"),
      `    ${store}`,
      ...filler("More filler"),
      "    f is {f()}.",
      "    Tail.",
      "  end",
      "end",
      "",
    ].join("\n");
    const c = programCompiler({ [MAIN_URI]: text }, CONFIG);
    quiet(() => c.compile());
    const edits = [
      ["Warm line.", "Warm line!"],
      ["Tail.", "Tail!"],
      ["Warm line!", "Warm line?"],
    ];
    for (const [i, [before, after]] of edits.entries()) {
      const at = text.indexOf(before!);
      c.compiler.updateDocument({
        textDocument: { uri: MAIN_URI, version: i + 2 },
        contentChanges: [
          {
            range: { start: posAt(text, at), end: posAt(text, at + before!.length) },
            text: after!,
          },
        ],
      });
      text = text.slice(0, at) + after + text.slice(at + before!.length);
      const { program } = quiet(() => c.compile());
      const run = storyRun(new ProgramStory(program.chunks!));
      expect(run.errors).toEqual([]);
      expect(run.beats.map((b) => b.text).join(""), `edit ${i}`).toContain(expected);
      expect(divergence(surface(program), coldSurface(text)), `edit ${i}`).toBeUndefined();
    }
  });
});
