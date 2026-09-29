// A `store` whose default is a table keeps the same table when a field of it
// is set, so the global still holds its default object. A save writes such a
// store whether or not it changed, so a field set in place survives the load.
// A default global's table is written with an anchor, and a load restores it
// into the loading story's own default table, so a saved local, a define
// built at init, or another store that shares it still shares it after the
// load, and a define reached through a store table is the live define.

import { describe, expect, test } from "vitest";
import { Story as RuntimeStory } from "../../inkjs/engine/Story";
import { VariablesState } from "../../inkjs/engine/VariablesState";
import { makeRuntimeStoryFromSource } from "./runtimeTestHarness";

function saveAfterFirstLine(source: string): {
  first: string;
  rest: string;
  globals: Record<string, unknown>;
  errors: string[];
} {
  const previous = VariablesState.dontSaveDefaultValues;
  VariablesState.dontSaveDefaultValues = true;
  try {
    const { story, compiledJson, errorMessages } =
      makeRuntimeStoryFromSource(source);
    const errors = [...errorMessages];
    story.onError = (m: string) => errors.push(`[before save] ${m}`);
    const first = story.Continue() ?? "";
    const json = story.state.ToJson();
    const again = new RuntimeStory(compiledJson as Record<string, any>);
    again.onError = (m: string) => errors.push(`[after load] ${m}`);
    again.state.LoadJson(json);
    const rest = again.ContinueMaximally();
    return {
      first,
      rest,
      globals: JSON.parse(json).variablesState ?? {},
      errors,
    };
  } finally {
    VariablesState.dontSaveDefaultValues = previous;
  }
}

describe("a store table changed in place", () => {
  test("a field set on a store's default table survives a save and load", () => {
    const run = saveAfterFirstLine(`store t = { n = 1 }
-> s
scene s
  & t.n = 2
  First {t.n}.
  Second {t.n}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first).toBe("First 2.\n");
    expect(run.rest).toBe("Second 2.\n");
    expect(Object.keys(run.globals)).toContain("t");
  });

  test("a store table a saved closure shares stays one table after a load", () => {
    const run = saveAfterFirstLine(`store t = { n = 1 }
-> s
scene s
  & local alias = t
  & local get = function() return alias.n end
  First {t.n}.
  & t.n = 2
  Second {get()}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First 1.\nSecond 2.\n");
    expect(Object.keys(run.globals)).toContain("t");
  });

  test("a define a store table holds is the live define after a load", () => {
    const run = saveAfterFirstLine(`define Bird with
  name = "Bird"
end
store state = { bird = Bird }
-> main
scene main
  First.
  Second {state.bird.name} {rawequal(state.bird, Bird)}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond Bird true.\n");
  });

  test("a store table a define holds stays one table after a load", () => {
    const run = saveAfterFirstLine(`store t = { n = 1 }
define Holder with
  alias = t
end
-> main
scene main
  First.
  & t.n = 2
  Second {Holder.alias.n} {rawequal(Holder.alias, t)}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond 2 true.\n");
  });

  test("a store's new instance a saved closure shares stays one table after a load", () => {
    const run = saveAfterFirstLine(`define Box with
  n = 1
end
store box = new Box()
-> main
scene main
  & local alias = box
  & local get = function() return alias.n end
  First.
  & box.n = 2
  Second {get()}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond 2.\n");
  });
});
