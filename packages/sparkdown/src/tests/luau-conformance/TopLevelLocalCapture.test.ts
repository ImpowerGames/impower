// A closure captures a plain `local` declared at the top level or in a scene
// body, reading and writing it as Luau does (I-822). Such a line parses as a
// `LuauSparkdownVariableDefinition`, the node `store` and `const` lines parse
// as, and `collectGlobalNameAt` listed its name among the global callable
// names `scanFreeVariables` leaves uncaptured, so the closure read and wrote
// an unassigned global instead. `store` and `const` stay globals, and a
// top-level function's name stays uncaptured.

import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, programSession, storyBeats } from "../program/programHarness";

const quiet = <T>(run: () => T): T => {
  const { warn, error } = console;
  console.warn = console.error = () => {};
  try {
    return run();
  } finally {
    console.warn = warn;
    console.error = error;
  }
};

const shown = (root: ProgramRoot) => {
  const { beats, errors } = storyBeats(new ProgramStory(root));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const run = (lines: string[]) =>
  quiet(() => shown(compileScript([...lines, ""].join("\n")).program.chunks!));

const reads = (decl: string) => [decl, "local f = function()", "  return a", "end", "Got {tostring(f())}."];

describe("a closure and a top-level local", () => {
  test.each([
    ["a plain local", "local a = 1"],
    ["an & local", "& local a = 1"],
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run(reads(decl))).toEqual({ texts: ["Got 1."], errors: [] });
  });

  test("writes a plain local", () => {
    expect(
      run(["local a = 1", "local f = function() a = 2 end", "& f()", "Got {tostring(a)}."]),
    ).toEqual({ texts: ["Got 2."], errors: [] });
  });

  test("writes a store", () => {
    expect(
      run(["store a = 1", "local f = function() a = 2 end", "& f()", "Got {tostring(a)}."]),
    ).toEqual({ texts: ["Got 2."], errors: [] });
  });

  test("calls a top-level function", () => {
    expect(
      run([
        "function g()",
        "  return 3",
        "end",
        "local f = function()",
        "  return g()",
        "end",
        "Got {f()}.",
      ]),
    ).toEqual({ texts: ["Got 3."], errors: [] });
  });
});

describe("a closure and a plain local in a scene", () => {
  test("reads it", () => {
    expect(
      run([
        "-> S",
        "scene S",
        "  local n = 5",
        "  local get = function() return n + 1 end",
        "  local r = get()",
        "  Got {r}.",
        "end",
      ]),
    ).toEqual({ texts: ["Got 6."], errors: [] });
  });

  test("writes it", () => {
    expect(
      run([
        "-> S",
        "scene S",
        "  local n = 0",
        "  local inc = function() n = n + 1 return n end",
        "  local r = inc()",
        "  Got {r} {n}.",
        "end",
      ]),
    ).toEqual({ texts: ["Got 1 1."], errors: [] });
  });
});

describe("an incremental compile of a closure over a top-level declaration", () => {
  test.each([
    ["a store turned into a local", "store a = 1", "local a = 1"],
    ["a local turned into a store", "local a = 1", "store a = 1"],
    ["a local added", "store b = 0", "store b = 0\nlocal a = 1"],
    ["a local removed", "store b = 0\nlocal a = 1", "store b = 0"],
  ])("shows what a cold compile shows after %s", (_, before, after) => {
    const lines = [before, "local f = function()", "  return a", "end", "Got {tostring(f())}.", ""];
    const session = programSession(lines.join("\n"));
    const root = session.edit(before, after);
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(cold.texts).toEqual([after.includes("a = 1") ? "Got 1." : "Got nil."]);
  });
});
