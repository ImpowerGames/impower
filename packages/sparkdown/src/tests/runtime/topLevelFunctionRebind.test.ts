// A top-level `function f` is Luau's `f = function` (#1591): `f` is a global,
// and a later assignment to it changes what `f()` calls, on both engines.
import "../../inkjs/engine/Container";
import { describe, expect, it } from "vitest";
import type { SparkProgram } from "../../compiler/types/SparkProgram";
import type { Story } from "../../inkjs/engine/Story";
import { ProgramStory } from "../../program/ProgramStory";
import {
  compileScript,
  MAIN_URI,
  programCompiler,
  storyBeats,
} from "../program/programHarness";

// The text a compiled story runs to on the engine `programChunks` selects,
// with the compile's error diagnostics and the run's errors.
const outcome = (
  { program, story }: { program: SparkProgram; story: Story },
  programChunks: boolean,
) => {
  const diagnostics = Object.values(program.diagnostics ?? {})
    .flat()
    .filter((d) => d.severity === 1)
    .map((d) => d.message);
  if (programChunks) {
    expect(program.fallback).toBeUndefined();
  } else {
    story.ResetState();
  }
  const beats = storyBeats(
    programChunks ? new ProgramStory(program.chunks!) : story,
  );
  return {
    text: beats.beats.map((b) => b.text).join(""),
    errors: [...diagnostics, ...beats.errors],
  };
};

const run = (text: string, programChunks: boolean) =>
  outcome(compileScript(text, { programChunks }), programChunks);

const cases: [string, string, string][] = [
  [
    "an `&` assignment rebinds a top-level function",
    "function f(...) return 7 end\n& f = function(...) return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a call before the rebind runs the original",
    "function f() return 7 end\nbefore {f()}.\n& f = function() return 2 end\nafter {f()}.\n",
    "before 7.\nafter 2.\n",
  ],
  [
    "an assignment inside a function rebinds the global",
    "function f() return 7 end\nfunction swap() f = function() return 3 end end\n& swap()\nf is {f()}.\n",
    "f is 3.\n",
  ],
  [
    "a local of the name in a block that has closed does not hide the global",
    "function f() return 7 end\nfunction swap()\n  do\n    local f = function() return 3 end\n  end\n  f = function() return 2 end\nend\n& swap()\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a local of the name declared after the assignment does not hide the global",
    "function f() return 7 end\nfunction swap()\n  f = function() return 2 end\n  local f = function() return 3 end\nend\n& swap()\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "an assignment to a local of the name in scope leaves the function alone",
    "function f() return 7 end\nfunction swap()\n  local f = function() return 3 end\n  f = function() return 2 end\nend\n& swap()\nf is {f()}.\n",
    "f is 7.\n",
  ],
  [
    "an assignment to a parameter of the name leaves the function alone",
    "function f() return 7 end\nfunction swap(f)\n  f = function() return 2 end\nend\n& swap(1)\nf is {f()}.\n",
    "f is 7.\n",
  ],
  [
    "a function that calls f sees the rebind when it runs",
    "function f() return 7 end\nfunction g() return f() end\n& f = function() return 4 end\ng is {g()}.\n",
    "g is 4.\n",
  ],
  // Each level of the original body calls the global, which is the wrapper:
  // f(3) = 100 + 3 + (100 + 2 + (100 + 1 + 0)) = 406, where a call that kept
  // the original would give 100 + 6.
  [
    "the function's own recursive call reaches the rebound value",
    "function f(n)\n  if n <= 0 then\n    return 0\n  end\n  return n + f(n - 1)\nend\n& local old = f\n& f = function(n) return 100 + old(n) end\nf is {f(3)}.\n",
    "f is 406.\n",
  ],
  [
    "a value read before the rebind keeps the original",
    "function f() return 7 end\n& local g = f\n& f = function() return 2 end\ng is {g()}, f is {f()}.\n",
    "g is 7, f is 2.\n",
  ],
  [
    "a call passes the rebound function the parameters it takes",
    "function f() return 7 end\n& f = function(x) return x end\nf is {f(2)}.\n",
    "f is 2.\n",
  ],
  [
    "a call need not pass the original's parameters",
    "function f(x) return x end\n& f = function() return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
  [
    "a local function value rebinds (control)",
    "local f = function(...) return 7 end\n& f = function(...) return 2 end\nf is {f()}.\n",
    "f is 2.\n",
  ],
];

// The text a compile of `text` runs to after an edit that replaces `before`
// with `after`, which compiles the edited script incrementally.
const runAfterEdit = (
  text: string,
  before: string,
  after: string,
  programChunks: boolean,
) => {
  const c = programCompiler({ [MAIN_URI]: text }, { programChunks });
  c.compile();
  const at = text.indexOf(before);
  const lineOf = (offset: number) => text.slice(0, offset).split("\n");
  const posAt = (offset: number) => {
    const lines = lineOf(offset);
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
  return outcome(c.compile(), programChunks);
};

describe("rebinding a top-level named function (#1591)", () => {
  for (const programChunks of [false, true]) {
    describe(`programChunks ${programChunks}`, () => {
      it.each(cases)("%s", (_name, text, expected) => {
        const result = run(text, programChunks);
        expect(result.errors).toEqual([]);
        expect(result.text).toBe(expected);
      });

      const fixed = "function f() return 7 end\n& x = 1\nf is {f()}.\n";
      const rebound =
        "function f() return 7 end\n& f = function() return 2 end\nf is {f()}.\n";
      it("an edit that adds the assignment rebinds the call", () => {
        expect(
          runAfterEdit(fixed, "& x = 1", "& f = function() return 2 end", programChunks),
        ).toEqual({ text: "f is 2.\n", errors: [] });
      });
      it("an edit that removes the assignment calls the function again", () => {
        expect(
          runAfterEdit(rebound, "& f = function() return 2 end", "& x = 1", programChunks),
        ).toEqual({ text: "f is 7.\n", errors: [] });
      });
      it("an edit that adds the assignment releases the call from the original's parameters", () => {
        const before = "function f() return 7 end\n& x = 1\nf is {f(2)}.\n";
        expect(run(before, programChunks).errors).toHaveLength(1);
        expect(
          runAfterEdit(before, "& x = 1", "& f = function(x) return x end", programChunks),
        ).toEqual({ text: "f is 2.\n", errors: [] });
      });
    });
  }
});
