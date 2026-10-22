// A multiple declaration evaluates every value before it binds any name, as
// Luau does (I-1409): a later value that reads an earlier name sees it
// unassigned. Separate declarations still bind one after another, and an
// issue a value raises is still reported on the declaration it belongs to.
import { afterEach, describe, expect, it, vi } from "vitest";
import { BinaryProgramReader } from "../../program/BinaryProgramReader";
import { describeInstruction } from "../../program/BinaryProgramWriter";
import type { ProgramRoot } from "../../program/ProgramRoot";
import { ProgramStory } from "../../program/ProgramStory";
import {
  MAIN_URI,
  compileScript,
  errorsOf,
  programSession,
  storyBeats,
} from "./programHarness";

const play = (text: string) => {
  const { program } = compileScript(text);
  expect(errorsOf(program)).toEqual([]);
  return storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text);
};

const declarationCode = (root: ProgramRoot): string[][] => {
  const reader = new BinaryProgramReader(root);
  return root.declarations(MAIN_URI)!.arrays.chunks.map((chunk) =>
    [...reader.instructions(chunk)].map(({ offset }) =>
      describeInstruction(chunk, offset, root.table),
    ),
  );
};

const READ_X = ["function readX()", "  return tostring(x)", "end", ""].join("\n");

describe("a multiple declaration binds after its values", () => {
  it("for a store", () => {
    expect(play(`${READ_X}store x, y = 1, readX()\n\nValue {y} then {x}.\n`)).toEqual([
      "Value nil then 1.\n",
    ]);
  });

  it("for a store whose last value is a spread call", () => {
    const script = [
      READ_X,
      "function g()",
      "  return readX(), 7",
      "end",
      "",
      "store x, y, z = 1, g()",
      "",
      "Value {x}, {y} and {z}.",
      "",
    ].join("\n");
    expect(play(script)).toEqual(["Value 1, nil and 7.\n"]);
  });

  it("for a store whose earlier value is a call cut to one value", () => {
    const script = [
      READ_X,
      "function pair()",
      "  return 2, 3",
      "end",
      "",
      "store x, y, z = pair(), 1, readX()",
      "",
      "Value {x}, {y} and {z}.",
      "",
    ].join("\n");
    expect(play(script)).toEqual(["Value 2, 1 and nil.\n"]);
  });

  it("keeps the order when an edit adds a name to the list", () => {
    const beats = (root: ProgramRoot) =>
      storyBeats(new ProgramStory(root)).beats.map((b) => b.text);
    const before = `${READ_X}store x = 1\n\nValue {x}.\n`;
    const after = `${READ_X}store x, y = 1, readX()\n\nValue {y} then {x}.\n`;
    const session = programSession(before);
    expect(beats(session.root)).toEqual(["Value 1.\n"]);
    session.edit("store x = 1", "store x, y = 1, readX()");
    const edited = beats(session.edit("Value {x}.", "Value {y} then {x}."));
    expect(errorsOf(session.program)).toEqual([]);
    expect(edited).toEqual(play(after));
    expect(edited).toEqual(["Value nil then 1.\n"]);
  });

  // A save names globals by name and a position in the story, never one in
  // a declaration chunk, which runs before any save is taken.
  it("loads a save taken before an edit adds a name to the list", () => {
    const before = `${READ_X}store x = 1\n\nValue {x}.\n\nMore {x}.\n`;
    const after = `${READ_X}store x, y = 1, readX()\n\nValue {x}.\n\nMore {x} {y}.\n`;
    const old = new ProgramStory(compileScript(before).program.chunks!);
    expect(old.Continue()).toBe("Value 1.\n");
    const save = old.state.toJson();
    const { program } = compileScript(after);
    expect(errorsOf(program)).toEqual([]);
    const story = new ProgramStory(program.chunks!);
    story.state.LoadJson(save);
    expect(story.Continue()).toBe("More 1 nil.\n");
  });

  // Locals take another path and already bind after their values; these
  // keep them in step with the store's order. A top-level `const` takes one
  // name (ConstMultiDeclaration.test.ts).
  it.each([
    ["a top-level local list", "local a, b = 1, a\n\nValue {b}.\n", "Value nil.\n"],
    [
      "a local list in a function",
      "function f()\n  local a = 0\n  local a, b = 1, a\n  return b\nend\nValue {f()}.\n",
      "Value 0.\n",
    ],
    [
      "a const list in a function",
      "function f()\n  const a, b = 1, a\n  return b\nend\nValue {f()}.\n",
      "Value nil.\n",
    ],
  ])("for %s", (_, script, expected) => {
    expect(play(script)).toEqual([expected]);
  });
});

// A name the story refuses as a duplicate keeps its first declaration's value,
// and the store's other names still take theirs. These pin the
// bindings only: the refused name's value expression is not evaluated, on
// main as here, which the Bug filed from round 2 of I-1409 tracks.
it.each([
  ["a spread call", "function pair()\n  return 3, 4\nend\nstore a = 1\nstore b, a = pair()\n\nValue {a} {b}.\n", 4, "Value 1 3.\n"],
  ["its own value", "store a = 1\nstore b, a = 5, 6\n\nValue {a} {b}.\n", 1, "Value 1 5.\n"],
])("drops the value of a duplicate name given by %s", (_, script, line, expected) => {
  const { program } = compileScript(script);
  expect(errorsOf(program)).toEqual([
    [line, "Duplicate identifier `a`. A var named `a` already exists on null"],
  ]);
  expect(storyBeats(new ProgramStory(program.chunks!)).beats.map((b) => b.text)).toEqual([
    expected,
  ]);
});

describe("separate declarations bind one after another", () => {
  it.each([
    [
      "stores in a function",
      "function holder()\n  store c = 1\n  store d = c + 1\n  return 0\nend\nValue {d}.\n",
      "Value 2.\n",
    ],
    [
      "a block's constant and store",
      "if true then\n  const X = 1\n  store y = X + 1\nend\nValue {y}.\n",
      "Value 2.\n",
    ],
    [
      "a store after a store of several names",
      "function holder()\n  store a, b = 1, 2\n  store c = a + b\n  return 0\nend\nValue {c}.\n",
      "Value 3.\n",
    ],
  ])("for %s", (_, script, expected) => {
    expect(play(script)).toEqual([expected]);
  });
});

describe("the declaration code", () => {
  // A store of one name, a constant, and a run of them, are what main
  // emitted before I-1409: no `DeclareValue`.
  it("is unchanged for declarations of one name", () => {
    expect(declarationCode(compileScript("store x = 1\nconst Y = 2\n\nHello.\n").program.chunks!)).toEqual([
      ["Int 1", "SetVar x flags 3"],
      ["Int 2", "SetVar Y flags 3"],
    ]);
    expect(
      declarationCode(
        compileScript("function holder()\n  store a = 1\n  store b = 2\n  return 0\nend\nHello.\n")
          .program.chunks!,
      ),
    ).toEqual([["Int 1", "SetVar a flags 3", "Int 2", "SetVar b flags 3"]]);
  });

  it("evaluates a store's values before it declares, and names each later value's global", () => {
    expect(
      declarationCode(
        compileScript(
          "function holder()\n  store c = 0\n  store a, b = 1, 2\n  store d = 3\n  return 0\nend\nHello.\n",
        ).program.chunks!,
      ),
    ).toEqual([
      [
        "Int 0",
        "SetVar c flags 3",
        "Int 1",
        "DeclareValue 2",
        "Int 2",
        "SetVar b flags 3",
        "SetVar a flags 3",
        "DeclareValue 3",
        "Int 3",
        "SetVar d flags 3",
      ],
    ]);
  });
});

describe("an issue a store's value raises", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  const linesOf = (text: string) => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { program } = compileScript(text);
    expect(program.chunks).toBeUndefined();
    return errorsOf(program).map(([line]) => line);
  };

  const FAIL = "1 // nil";
  const WARN = "trigger()";
  const TRIGGER = 'function trigger()\n  display({text = "A", continues = true})\n  return 0\nend\n';

  // The store of several names is on line 6, between stores on lines 5 and 7.
  const holder = (values: string, after = "2") =>
    `${TRIGGER}function holder()\n  store c = 1\n  store a, b, e = ${values}\n  store d = ${after}\n  return 0\nend\nHello.\n`;

  it.each([
    ["an error in the first value", `${FAIL}, 2, 3`],
    ["an error in a middle value", `1, ${FAIL}, 3`],
    ["an error in the last value", `1, 2, ${FAIL}`],
    ["a warning in the first value", `${WARN}, 2, 3`],
    ["a warning in a middle value", `1, ${WARN}, 3`],
    ["a warning in the last value", `1, 2, ${WARN}`],
    ["an error in a value after the last name", `1, 2, 3, ${FAIL}`],
  ])("reports %s at that store", (_, values) => {
    expect(linesOf(holder(values))).toEqual([6]);
  });

  it.each([
    ["an error", FAIL],
    ["a warning", WARN],
  ])("reports %s in the store after it at that store", (_, value) => {
    expect(linesOf(holder("1, 2, 3", value))).toEqual([7]);
  });

  it("reports an error in a spread call's values at that store, and in the store after it there", () => {
    const pair = "function pair()\n  return 3, 4\nend\n";
    const script = (values: string, after: string) =>
      `${pair}function holder()\n  store c = 1\n  store a, b, e = ${values}\n  store d = ${after}\n  return 0\nend\nHello.\n`;
    expect(linesOf(script(`${FAIL}, pair()`, "2"))).toEqual([5]);
    expect(linesOf(script(`1, pair()`, FAIL))).toEqual([6]);
  });
});
