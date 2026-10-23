// A return in a Luau function's body completes its statement memo, so an
// edit elsewhere in the function that leaves its reads unchanged serves it
// from that memo instead of lowering it again (I-1423). Before, a return was
// among what the story's passes over the whole program take of a statement
// (`holdsWhatTheStoryWalks`), so the resolver gave its memo no resolution and
// the compile never completed it; but those passes take only a return a
// scene, a branch or the file's top level holds, which they report, and such
// a return is still lowered whenever its block is.
import { describe, expect, it } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import { loweredOutsideRebuilt } from "./memoLowering";
import { describeRoot, MAIN_URI, programCompiler, programSession, storyBeats } from "./programHarness";

const quietly = <T>(run: () => T): T => {
  const { warn, error, log } = console;
  console.warn = console.error = console.log = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
    console.log = log;
  }
};

type Session = ReturnType<typeof programSession>;

// Statements between the edits and the return, so that the incremental parse
// rebuilds none of the return's lines.
const padding = (indent: string) =>
  Array.from({ length: 10 }, (_, i) => `${indent}local p${i} = ${i}`);

// The ticket's script: `foo(1, 2)` is 2, so the story shows `Got 2.`.
const script = (ending: readonly string[]) =>
  [
    "function run()",
    '  function foo(n, ...) return n + select("#", ...) end',
    "  local function g()",
    "    local x = 1",
    "    do local bar = 1 end",
    ...padding("    "),
    ...ending.map((line) => `    ${line}`),
    "  end",
    "  return g()",
    "end",
    "Got {run()}.",
    "",
  ].join("\n");

const sameAsCold = (s: Session) => {
  const cold = quietly(() => programCompiler({ [MAIN_URI]: s.text }).compile().program);
  expect(describeRoot(s.program.chunks!)).toEqual(describeRoot(cold.chunks!));
  expect(s.program.diagnostics).toEqual(cold.diagnostics);
};

const shown = (s: Session): string[] => {
  const { beats, errors } = storyBeats(new ProgramStory(s.program.chunks!));
  return [beats.map((beat) => beat.text.trim()).join(" "), ...errors];
};

const messages = (s: Session): string[] =>
  Object.values(s.program.diagnostics ?? {})
    .flat()
    .map((d) => (typeof d.message === "string" ? d.message : String((d.message as { value?: string }).value)));

describe("a return in a function's body (I-1423)", () => {
  it.each([
    ["a return", ["return foo(1, 2)"], "Got 2."],
    ["a return of several values", ["return foo(1, 2), 3"], "Got 2."],
    ["a return inside an `if` block", ["if true then return foo(1, 2) end", "return 0"], "Got 2."],
    ["a local the return returns", ["local r = foo(1, 2)", "return r"], "Got 2."],
  ])("is served from its memo after an edit elsewhere in the function: %s", (_, ending, result) => {
    const s = programSession(script(ending));
    // The first incremental parse of a block after a cold one reparses the
    // whole block.
    s.edit("local p0 = 0", "local p0 = 10");
    for (const value of ["2", "3", "4"]) {
      s.edit(/local x = \d+/.exec(s.text)![0], `local x = ${value}`);
      expect(loweredOutsideRebuilt(s.compiler.memoStats(MAIN_URI)!, s.text)).toEqual([]);
      sameAsCold(s);
      expect(shown(s)).toEqual([result]);
    }
  });

  it("is lowered again when an edit changes what it reads", () => {
    const s = programSession(script(["return foo(1, 2)"]));
    s.edit("local p0 = 0", "local p0 = 10");
    s.edit("local x = 1", "local x = 2");
    s.edit('function foo(n, ...) return n + select("#", ...) end', "local function foo(n) return n * 100 end");
    sameAsCold(s);
    expect(shown(s)).toEqual(["Got 100."]);
  });
});

describe("a return outside a function's body (I-1423)", () => {
  it("is still reported after an edit elsewhere in its scene", () => {
    const s = programSession(
      ["-> a", "scene a", "  & local x = 1", ...padding("  & "), "  if true then", "    & return 5", "  end", "end", ""].join("\n"),
    );
    const reported = messages(s).filter((m) => /Return statements can only/.test(m));
    expect(reported).toHaveLength(1);
    s.edit("local p0 = 0", "local p0 = 10");
    for (const value of ["2", "3"]) {
      s.edit(/local x = \d+/.exec(s.text)![0], `local x = ${value}`);
      expect(messages(s).filter((m) => /Return statements can only/.test(m))).toEqual(reported);
      sameAsCold(s);
    }
  });
});
