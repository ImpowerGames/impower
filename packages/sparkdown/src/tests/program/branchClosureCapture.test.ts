import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, storyBeats } from "./programHarness";

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

const rootOf = (lines: string[]): ProgramRoot =>
  quiet(() => {
    const { program } = compileScript([...lines, ""].join("\n"));
    expect(errorsOf(program)).toEqual([]);
    return program.chunks!;
  });

const run = (lines: string[]) => {
  const { beats, errors } = quiet(() => storyBeats(new ProgramStory(rootOf(lines))));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const got = (...texts: string[]) => ({ texts, errors: [] });

const sceneThenBranch = (branch: string[]) => [
  "scene start",
  "  -> main",
  "end",
  "scene main",
  "  local foo = 5",
  "  -> b",
  "  branch b",
  ...branch.map((line) => `    ${line}`),
  "    done",
  "  end",
  "end",
];

describe("a closure written in a branch its own scene enters", () => {
  test("a function value reads the scene's local", () => {
    expect(
      run(sceneThenBranch(["local f = function() return foo end", "Got {f()}."])),
    ).toEqual(got("Got 5."));
  });

  test("a local function reads the scene's local", () => {
    expect(
      run(
        sceneThenBranch([
          "local function g()",
          "  return foo",
          "end",
          "Got {g()}.",
        ]),
      ),
    ).toEqual(got("Got 5."));
  });

  test("a function stored on a table reads the scene's local", () => {
    expect(
      run(
        sceneThenBranch([
          "local t = {}",
          "function t.get()",
          "  return foo",
          "end",
          "Got {t.get()}.",
        ]),
      ),
    ).toEqual(got("Got 5."));
  });

  test("a function value inside a block reads the scene's local", () => {
    expect(
      run(
        sceneThenBranch([
          "if true then",
          "  local f = function() return foo end",
          "  Got {f()}.",
          "end",
        ]),
      ),
    ).toEqual(got("Got 5."));
  });

  test("a function value nested in a function value reads the scene's local", () => {
    expect(
      run(
        sceneThenBranch([
          "local f = function() return function() return foo end end",
          "Got {f()()}.",
        ]),
      ),
    ).toEqual(got("Got 5."));
  });

  test("writes the scene's local the branch then reads", () => {
    expect(
      run(
        sceneThenBranch([
          "local set = function(v) foo = v end",
          "& set(8)",
          "Got {foo}.",
        ]),
      ),
    ).toEqual(got("Got 8."));
  });

  test("writes the scene's local through a tunnel, which the scene reads after", () => {
    expect(
      run([
        "scene start",
        "  local foo = 1",
        "  -> b ->",
        "  After {foo}.",
        "  done",
        "  branch b",
        "    local bump = function() foo = foo + 1 end",
        "    & bump()",
        "    ->->",
        "  end",
        "end",
      ]),
    ).toEqual(got("After 2."));
  });

  test("reads the scene's newest declaration of the name", () => {
    expect(
      run([
        "scene start",
        "  local foo = 1",
        "  local foo = 2",
        "  -> b",
        "  branch b",
        "    local f = function() return foo end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 2."));
  });

  test("reads the branch's own local over the scene's", () => {
    expect(
      run(
        sceneThenBranch([
          "local foo = 6",
          "local f = function() return foo end",
          "Got {f()}.",
        ]),
      ),
    ).toEqual(got("Got 6."));
  });

  test("reads the scene's local named like a stdlib namespace", () => {
    expect(
      run([
        "scene start",
        "  local math = { answer = 3 }",
        "  -> b",
        "  branch b",
        "    local f = function() return math.answer end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 3."));
  });

  test("reads the scene's local after a divert from a sibling branch", () => {
    expect(
      run([
        "scene start",
        "  local foo = 5",
        "  -> a",
        "  branch a",
        "    -> c",
        "  end",
        "  branch c",
        "    local f = function() return foo end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });

  test("reads the scene's parameter", () => {
    expect(
      run([
        "scene start",
        "  -> main(5)",
        "end",
        "scene main(foo)",
        "  branch b",
        "    local f = function() return foo end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });

  test("reads the scene's parameter and local after a divert that follows a line", () => {
    expect(
      run([
        "scene start",
        "  -> main(5)",
        "end",
        "scene main(foo)",
        "  local bar = 7",
        "  -> b",
        "  branch b",
        "    local f = function() return foo + bar end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 12."));
  });

  test("reads nil for a sibling branch's local", () => {
    expect(
      run([
        "scene start",
        "  -> a",
        "  branch a",
        "    local foo = 5",
        "    -> c",
        "  end",
        "  branch c",
        "    local f = function() return tostring(foo) end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });
});

describe("a closure written in a branch another scene enters", () => {
  test("reads nil for the scene's local", () => {
    expect(
      run([
        "scene S",
        "  local foo = 1",
        "  branch B",
        "    local f = function() return tostring(foo) end",
        "    Got {f()}.",
        "  end",
        "end",
        "scene start",
        "  local foo = 2",
        "  -> S.B",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });

  test("reads nil for the scene's local after the scene ran before", () => {
    expect(
      run([
        "store passes = 0",
        "scene start",
        "  -> S",
        "end",
        "scene S",
        "  local foo = 1",
        "  & passes = passes + 1",
        "  if passes < 2 then",
        "    -> T",
        "  end",
        "  branch B",
        "    local f = function() return tostring(foo) end",
        "    Got {f()}.",
        "  end",
        "end",
        "scene T",
        "  -> S.B",
        "end",
      ]),
    ).toEqual(got("Got nil."));
  });
});
