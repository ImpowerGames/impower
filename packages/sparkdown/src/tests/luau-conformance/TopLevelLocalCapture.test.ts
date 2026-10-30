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

const inScene = (lines: string[]) => ["scene start", ...lines.map((line) => `  ${line}`), "end"];

const reads = ["local f = function()", "  return a", "end", "Got {tostring(f())}."];

describe("a closure in a scene and a top-level declaration", () => {
  test.each([
    ["a store", "store a = 1"],
    ["a const", "const a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run([decl, ...inScene(reads)])).toEqual({ texts: ["Got 1."], errors: [] });
  });

  test("writes a store", () => {
    expect(
      run(["store a = 1", ...inScene(["local f = function() a = 2 end", "& f()", "Got {tostring(a)}."])]),
    ).toEqual({ texts: ["Got 2."], errors: [] });
  });

  test("calls a top-level function", () => {
    expect(
      run([
        "function g()",
        "  return 3",
        "end",
        ...inScene(["local f = function()", "  return g()", "end", "Got {f()}."]),
      ]),
    ).toEqual({ texts: ["Got 3."], errors: [] });
  });
});

describe("a closure and a plain local in a scene", () => {
  test.each([
    ["a plain local", "local a = 1"],
    ["an & local", "& local a = 1"],
  ])("reads %s", (_, decl) => {
    expect(run(inScene([decl, ...reads]))).toEqual({ texts: ["Got 1."], errors: [] });
  });

  test("reads it", () => {
    expect(
      run([
        "scene start",
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
        "scene start",
        "  local n = 0",
        "  local inc = function() n = n + 1 return n end",
        "  local r = inc()",
        "  Got {r} {n}.",
        "end",
      ]),
    ).toEqual({ texts: ["Got 1 1."], errors: [] });
  });
});

describe("an incremental compile of a closure over a declaration", () => {
  test.each([
    ["a store turned into a scene's local", "store a = 1\nscene start", "scene start\n  local a = 1"],
    ["a scene's local turned into a store", "scene start\n  local a = 1", "store a = 1\nscene start"],
    ["a local added", "store b = 0\nscene start", "store b = 0\nscene start\n  local a = 1"],
    ["a local removed", "store b = 0\nscene start\n  local a = 1", "store b = 0\nscene start"],
  ])("shows what a cold compile shows after %s", (_, before, after) => {
    const lines = [before, "  local f = function()", "    return a", "  end", "  Got {tostring(f())}.", "end", ""];
    const session = programSession(lines.join("\n"));
    const root = session.edit(before, after);
    const cold = run([session.text]);
    expect(quiet(() => shown(root))).toEqual(cold);
    expect(cold.texts).toEqual([after.includes("a = 1") ? "Got 1." : "Got nil."]);
  });
});
