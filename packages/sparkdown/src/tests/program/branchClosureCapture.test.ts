import { describe, expect, test } from "vitest";
import { ProgramStory } from "../../program/ProgramStory";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { compileScript, errorsOf, programSession, storyBeats, storyRun } from "./programHarness";

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

const runPicking = (picks: number[], lines: string[]) => {
  const { beats, errors } = quiet(() => storyRun(new ProgramStory(rootOf(lines)), picks));
  return { texts: beats.map((b) => b.text.trim()), errors };
};

const mathTable = "{ abs = function() return 5 end }";

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

  test("reads the scene's local declared in a choose block's then clause", () => {
    expect(
      runPicking([0], [
        "scene start",
        "  choose",
        "    + [Go]",
        "      Went.",
        "  then",
        "    local foo = 6",
        "  end",
        "  -> b",
        "  branch b",
        "    local f = function() return foo end",
        "    Got {foo} {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Went.", "Got 6 6."));
  });

  test("reads the scene's local declared in the body of the choice taken", () => {
    expect(
      runPicking([0], [
        "scene start",
        "  choose",
        "    + [Go]",
        "      local foo = 7",
        "  end",
        "  -> b",
        "  branch b",
        "    local f = function() return foo end",
        "    Got {foo} {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 7 7."));
  });

  test("inside a block, calls the scene's local named like a stdlib namespace", () => {
    expect(
      run([
        "scene start",
        `  local math = ${mathTable}`,
        "  -> b",
        "  branch b",
        "    Direct {math.abs(-1)}.",
        "    if true then",
        "      local f = function() return math.abs(-1) end",
        "      Got {f()}.",
        "    end",
        "  end",
        "end",
      ]),
    ).toEqual(got("Direct 5.", "Got 5."));
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

describe("a scene's own lines", () => {
  test("a closure after a choose block reads the local its then clause declared", () => {
    expect(
      runPicking([0], [
        "scene start",
        "  choose",
        "    + [Go]",
        "      Went.",
        "  then",
        "    local foo = 6",
        "  end",
        "  local f = function() return foo end",
        "  Got {foo} {f()}.",
        "end",
      ]),
    ).toEqual(got("Went.", "Got 6 6."));
  });

  test("a closure in a later choice calls the stdlib namespace an earlier choice's local names", () => {
    expect(
      runPicking([1], [
        "scene start",
        "  choose",
        "    + [A]",
        `      local math = ${mathTable}`,
        "      A.",
        "    + [B]",
        "      local f = function() return math.abs(-1) end",
        "      Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 1."));
  });

  test("a closure inside a block calls the scene's local named like a stdlib namespace", () => {
    expect(
      run([
        "scene start",
        `  local math = ${mathTable}`,
        "  if true then",
        "    local f = function() return math.abs(-1) end",
        "    Got {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 5."));
  });

  test("a block calls its own local named like a stdlib namespace, directly and through a closure", () => {
    expect(
      run([
        "scene start",
        "  if true then",
        `    local math = ${mathTable}`,
        "    local f = function() return math.abs(-1) end",
        "    Got {math.abs(-1)} {f()}.",
        "  end",
        "end",
      ]),
    ).toEqual(got("Got 5 5."));
  });
});

describe("a closure in a branch after an edit to its scene's locals", () => {
  const texts = (root: ProgramRoot, picks: number[] = []) =>
    quiet(() => storyRun(new ProgramStory(root), picks)).beats.map((b) => b.text.trim());

  test("reads a then clause's local the edit adds, and nil once it is removed", () => {
    const session = programSession(
      [
        "scene start",
        "  Before.",
        "  choose",
        "    + [Go]",
        "      Went.",
        "  then",
        "    & local other = 1",
        "  end",
        "  -> b",
        "  branch b",
        "    local f = function() return tostring(foo) end",
        "    Got {f()}.",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    session.edit("Before.", "Before two.");
    expect(texts(session.edit("& local other = 1", "local foo = 6"), [0])).toEqual(["Before two.", "Went.", "Got 6."]);
    expect(texts(session.edit("local foo = 6", "& local other = 1"), [0])).toEqual(["Before two.", "Went.", "Got nil."]);
  });

  test("inside a block, calls a stdlib-named local the edit adds, and the builtin once it is removed", () => {
    const session = programSession(
      [
        "scene start",
        "  Before.",
        "  & local other = 1",
        "  -> b",
        "  branch b",
        "    if true then",
        "      local f = function() return math.abs(-1) end",
        "      Got {f()}.",
        "    end",
        "  end",
        "end",
        "",
      ].join("\n"),
    );
    session.edit("Before.", "Before two.");
    expect(texts(session.edit("& local other = 1", `local math = ${mathTable}`))).toEqual(["Before two.", "Got 5."]);
    expect(texts(session.edit(`local math = ${mathTable}`, "& local other = 1"))).toEqual(["Before two.", "Got 1."]);
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
