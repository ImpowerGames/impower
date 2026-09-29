// #1091 — a closure's captured variables survive a story state save and load.
//
// A closure's upvalue is a pointer cell: open while the variable it captured
// is still bound in a live frame or block scope, closed (holding the value
// itself) once that binding ends. Every case here runs the script straight
// through, then again with a save after the first line: a fresh story from the
// same compiled program loads the save and runs the rest. Both runs have to
// print the same thing.

import { describe, expect, test } from "vitest";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function straight(source: string): { output: string; errors: string[] } {
  const { story, errorMessages } = makeRuntimeStoryFromSource(source);
  const errors = [...errorMessages];
  story.onError = (m: string) => errors.push(m);
  const output = story.ContinueMaximally();
  return { output, errors };
}

function restored(source: string): {
  output: string;
  errors: string[];
  savedJson: string;
} {
  const { story, errorMessages, compiledJson } =
    makeRuntimeStoryFromSource(source);
  const errors = errorMessages.map((m) => `[compile] ${m}`);
  story.onError = (m: string) => errors.push(`[before save] ${m}`);
  const first = story.Continue();
  const savedJson = story.state.ToJson();

  const again = new RuntimeStory(compiledJson as Record<string, any>);
  again.onError = (m: string) => errors.push(`[after load] ${m}`);
  again.state.LoadJson(savedJson);
  let rest = "";
  try {
    rest = again.ContinueMaximally();
  } catch (e) {
    errors.push(`[after load] ${String(e)}`);
  }
  return { output: (first ?? "") + rest, errors, savedJson };
}

// The upvalue cells a save holds: each cell id with whether it is closed, how
// many times it is written, and whether a call-stack element lists it as open.
function cellsIn(
  savedJson: string,
): Map<number, { closed: boolean; occurrences: number; listed: boolean }> {
  const cells = new Map<
    number,
    { closed: boolean; occurrences: number; listed: boolean }
  >();
  const visit = (node: unknown, listed: boolean): void => {
    if (Array.isArray(node)) {
      for (const item of node) visit(item, listed);
      return;
    }
    if (!node || typeof node !== "object") return;
    const obj = node as Record<string, unknown>;
    if (obj["^var"] !== undefined && typeof obj["cell"] === "number") {
      const cell = cells.get(obj["cell"]) ?? {
        closed: false,
        occurrences: 0,
        listed: false,
      };
      cell.closed ||= obj["closed"] === 1;
      cell.occurrences++;
      cell.listed ||= listed;
      cells.set(obj["cell"], cell);
    }
    for (const [key, value] of Object.entries(obj)) {
      visit(value, key === "upvalues");
    }
  };
  visit(JSON.parse(savedJson), false);
  return cells;
}

function expectSameAcrossSave(source: string, expected: string): string {
  const run = straight(source);
  expect(run.errors).toEqual([]);
  expect(run.output).toBe(expected);
  const resumed = restored(source);
  expect(resumed.errors).toEqual([]);
  expect(resumed.output).toBe(expected);
  return resumed.savedJson;
}

const counter = `function make()
  local n = 10
  return function()
    n = n + 1
    return n
  end
end

-> s
scene s
  & local inc = make()
  & local a = inc()
  First {a}.
  & local b = inc()
  Second {b}.
  fin
end
`;

function blockLocal(open: string, close: string): string {
  return `store out = ""
-> s
scene s
  & local x = "outer"
  & local f = nil
  ${open}
    local x = "inner"
    f = function() return x end
    Mid line.
  ${close}
  & out = f()
  Result {out}.
  fin
end
`;
}

describe("closures across a save and load", () => {
  test("a closed upvalue keeps its value and stays writable", () => {
    const saved = expectSameAcrossSave(counter, "First 11.\nSecond 12.\n");
    expect([...cellsIn(saved).values()]).toEqual([
      { closed: true, occurrences: 1, listed: false },
    ]);
  });

  test.each([
    ["do", "do", "end"],
    ["if", "if true then", "end"],
    ["while", "while true do", "break end"],
  ])(
    "an upvalue open in a %s block closes when the block ends after the load",
    (_name, open, close) => {
      const saved = expectSameAcrossSave(
        blockLocal(open, close),
        "Mid line.\nResult inner.\n",
      );
      expect([...cellsIn(saved).values()]).toEqual([
        { closed: false, occurrences: 2, listed: true },
      ]);
    },
  );

  test("two closures sharing an open upvalue still share it after the load", () => {
    const source = `store out = ""
-> s
scene s
  & local inc = nil
  & local get = nil
  do
    local n = 0
    inc = function() n = n + 1 end
    get = function() return n end
    Mid line.
  end
  & inc()
  & inc()
  & out = get()
  Result {out}.
  fin
end
`;
    const saved = expectSameAcrossSave(source, "Mid line.\nResult 2.\n");
    expect([...cellsIn(saved).values()]).toEqual([
      { closed: false, occurrences: 3, listed: true },
    ]);
  });

  test("two closures sharing a closed upvalue still share it after the load", () => {
    const source = `store out = ""
function make()
  local n = 0
  return function() n = n + 1 end, function() return n end
end

-> s
scene s
  & local inc, get = make()
  & inc()
  First line.
  & inc()
  & out = get()
  Result {out}.
  fin
end
`;
    const saved = expectSameAcrossSave(source, "First line.\nResult 2.\n");
    expect([...cellsIn(saved).values()]).toEqual([
      { closed: true, occurrences: 2, listed: false },
    ]);
  });

  test("a recursive local function whose closed upvalue holds itself survives the load", () => {
    const source = `function make()
  local function fact(k)
    if k <= 1 then
      return 1
    end
    return k * fact(k - 1)
  end
  return fact
end

-> s
scene s
  & local fact = make()
  First {fact(3)}.
  Second {fact(4)}.
  fin
end
`;
    const saved = expectSameAcrossSave(source, "First 6.\nSecond 24.\n");
    // The closed cell's value is the function that holds the cell, written as
    // a reference to the function table already being written.
    expect([...cellsIn(saved).values()]).toEqual([
      { closed: true, occurrences: 1, listed: false },
    ]);
    expect(saved).toContain(`"objref"`);
  });

  test("an upvalue open in the scene frame still reads the live variable after the load", () => {
    const source = `store out = ""
-> s
scene s
  & local x = 1
  & local get = function() return x end
  First line.
  & x = 5
  & out = get()
  Result {out}.
  fin
end
`;
    const saved = expectSameAcrossSave(source, "First line.\nResult 5.\n");
    expect([...cellsIn(saved).values()]).toEqual([
      { closed: false, occurrences: 2, listed: true },
    ]);
  });

  test("an upvalue open in a block stays open across a choice and closes at the block end, with and without a save at the choice", () => {
    const source = `store out = ""
-> s
scene s
  & local x = "outer"
  & local f = nil
  do
    local x = "inner"
    f = function() return x end
    choose
      * Pick
    end
    x = "changed"
  end
  & out = f()
  Result {out}.
  fin
end
`;
    const { story, errorMessages, compiledJson } =
      makeRuntimeStoryFromSource(source);
    const errors = [...errorMessages];
    story.onError = (m: string) => errors.push(`[straight] ${m}`);
    story.ContinueMaximally();
    expect(story.currentChoices.map((c) => c.text)).toEqual(["Pick"]);
    const savedJson = story.state.ToJson();
    story.ChooseChoiceIndex(0);
    expect(story.ContinueMaximally()).toBe("Pick\nResult changed.\n");

    const again = new RuntimeStory(compiledJson as Record<string, any>);
    again.onError = (m: string) => errors.push(`[after load] ${m}`);
    again.state.LoadJson(savedJson);
    again.ChooseChoiceIndex(0);
    expect(again.ContinueMaximally()).toBe("Pick\nResult changed.\n");
    expect(errors).toEqual([]);
  });

  test("a `<-` thread's own local does not close the cell its parent thread still binds", () => {
    const source = `-> main
scene main
  & local x = 1
  & local get = function() return x end
  <- side
  & x = 5
  Result {get()}.
  fin
end
scene side
  & local x = 2
  done
end
`;
    const run = straight(source);
    expect(run.errors).toEqual([]);
    expect(run.output).toBe("Result 5.\n");
  });

  test("a closed upvalue of a closure held by a store keeps its value", () => {
    const source = `function make()
  local n = 10
  return function()
    n = n + 1
    return n
  end
end
store inc = make()

-> s
scene s
  First {inc()}.
  Second {inc()}.
  fin
end
`;
    expectSameAcrossSave(source, "First 11.\nSecond 12.\n");
  });

  test("a save written without upvalue cells still loads", () => {
    // A save whose pointers carry no cell id (the form every save had before
    // cells were written) loads each pointer as its own open cell.
    const source = `store out = ""
-> s
scene s
  & local x = 1
  & local get = function() return x end
  First line.
  & x = 5
  & out = get()
  Result {out}.
  fin
end
`;
    const { story, compiledJson } = makeRuntimeStoryFromSource(source);
    story.Continue();
    const saved = JSON.parse(story.state.ToJson());
    const stripCells = (node: unknown): unknown => {
      if (Array.isArray(node)) return node.map(stripCells);
      if (node && typeof node === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(node)) {
          if (["cell", "closed", "cv", "upvalues"].includes(k)) continue;
          out[k] = stripCells(v);
        }
        return out;
      }
      return node;
    };
    const again = new RuntimeStory(compiledJson as Record<string, any>);
    const errors: string[] = [];
    again.onError = (m: string) => errors.push(m);
    again.state.LoadJson(JSON.stringify(stripCells(saved)));
    expect(again.ContinueMaximally()).toBe("Result 5.\n");
    expect(errors).toEqual([]);
  });
});
