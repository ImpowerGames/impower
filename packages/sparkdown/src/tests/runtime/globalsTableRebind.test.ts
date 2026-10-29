import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import { ProgramStory } from "../../program/ProgramStory";
import {
  compileScript,
  MAIN_URI,
  programCompiler,
  storyBeats,
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

const run = (text: string) => outcome(compileScript(text));

const cases: [string, string, string][] = [
  [
    "a field write through _G rebinds a top-level function",
    "function f() return 7 end\n& _G.f = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a string-key index write through _G rebinds a top-level function",
    "function f() return 7 end\n& _G['f'] = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a write through _G inside a function rebinds the global",
    "function f() return 7 end\nfunction swap() _G.f = function() return 3 end end\n& swap()\nf is {f()}.\n",
    "f is 3.\n",
  ],
  [
    "a call before the _G write runs the original",
    "function f() return 7 end\nbefore {f()}.\n& _G.f = function() return 2 end\nafter {f()}.\n",
    "before 7.\nafter 2.\n",
  ],
  [
    "a write through _G of another name leaves the function alone",
    "function f() return 7 end\n& _G.g = function() return 2 end\nf is {f()}.\n",
    "f is 7.\n",
  ],
  [
    "a plain assignment rebinds (control)",
    "function f() return 7 end\n& f = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
];

const runAfterEdit = (text: string, before: string, after: string) => {
  const c = programCompiler({ [MAIN_URI]: text });
  c.compile();
  const at = text.indexOf(before);
  const posAt = (offset: number) => {
    const lines = text.slice(0, offset).split("\n");
    return { line: lines.length - 1, character: lines.at(-1)!.length };
  };
  c.compiler.updateDocument({
    textDocument: { uri: MAIN_URI, version: 2 },
    contentChanges: [
      {
        range: { start: posAt(at), end: posAt(at + before.length) },
        text: after,
      },
    ],
  });
  return outcome(c.compile());
};

describe("rebinding a top-level function through _G (I-1091)", () => {
  it.each(cases)("%s", (_name, text, expected) => {
    expect(run(text)).toEqual({ text: expected, errors: [] });
  });

  it("a write through _G past a local of the name rebinds the global", () => {
    const text =
      "function f() return 7 end\nfunction swap()\n  local f = 3\n  _G.f = function() return f end\nend\n& swap()\nf is {f()}.\n";
    expect(run(text)).toEqual({
      text: "f is 3.\n",
      errors: [
        expect.objectContaining({
          value: "Variable 'f' shadows a global variable used at line 1",
        }),
      ],
    });
  });

  const fixed = "function f() return 7 end\n& x = 1\nf is {f()}.\n";
  const rebound =
    "function f() return 7 end\n& _G.f = function() return 2 end\nf is {f()}.\n";
  it("an edit that adds the _G write rebinds the call", () => {
    expect(
      runAfterEdit(fixed, "& x = 1", "& _G.f = function() return 2 end"),
    ).toEqual({ text: "f is 2.\n", errors: [] });
  });
  it("an edit that removes the _G write calls the function again", () => {
    expect(
      runAfterEdit(rebound, "& _G.f = function() return 2 end", "& x = 1"),
    ).toEqual({ text: "f is 7.\n", errors: [] });
  });
  it("an edit that renames the _G write's key calls the function again", () => {
    expect(runAfterEdit(rebound, "_G.f", "_G.g")).toEqual({
      text: "f is 7.\n",
      errors: [],
    });
  });
});
