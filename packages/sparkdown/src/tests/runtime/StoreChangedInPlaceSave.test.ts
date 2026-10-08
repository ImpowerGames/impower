// A `store` whose default is a table keeps the same table when a field of it
// is set, so the global still holds its default object. A save writes such a
// store whether or not it changed, so a field set in place survives the load.
// A default global's table is written with an anchor, and a load restores it
// into the loading story's own default table, so a saved local, a define
// built at init, or another store that shares it still shares it after the
// load, and a define reached through a store table is the live define.

import { describe, expect, test } from "vitest";
import { testStory } from "../engineUnderTest";
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
    const again = testStory(compiledJson as Record<string, any>);
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

  test("a counter in a frozen store table keeps counting after a load", () => {
    const run = saveAfterFirstLine(`function make()
  local n = 0
  return function()
    n = n + 1
    return n
  end
end
store t = table.freeze({ inc = make() })
-> main
scene main
  First {t.inc()}.
  Second {t.inc()}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First 1.\nSecond 2.\n");
  });

  test("a table inside a frozen store table keeps its changes after a load", () => {
    const run = saveAfterFirstLine(`store t = table.freeze({ inner = { n = 0 } })
-> main
scene main
  & t.inner.n = 4
  First.
  Second {t.inner.n}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond 4.\n");
  });

  test("a save loads into a story whose store table was frozen after it", () => {
    const previous = VariablesState.dontSaveDefaultValues;
    VariablesState.dontSaveDefaultValues = true;
    try {
      const { story, errorMessages } = makeRuntimeStoryFromSource(`store t = { n = 1 }
-> main
scene main
  First.
  & t.n = 2
  & table.freeze(t)
  Second {t.n} {table.isfrozen(t)}.
  fin
end
`);
      const errors = [...errorMessages];
      story.onError = (m: string) => errors.push(m);
      expect(story.Continue()).toBe("First.\n");
      const json = story.state.ToJson();
      expect(story.ContinueMaximally()).toBe("Second 2 true.\n");
      story.state.LoadJson(json);
      expect(story.ContinueMaximally()).toBe("Second 2 true.\n");
      expect(errors).toEqual([]);
    } finally {
      VariablesState.dontSaveDefaultValues = previous;
    }
  });

  test("a saved local holding a constant's nested table is that table after a load", () => {
    const run = saveAfterFirstLine(`const C = { sub = { n = 1 } }
-> main
scene main
  & local alias = C.sub
  First.
  Second {alias.n} {rawequal(alias, C.sub)}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond 1 true.\n");
  });

  test("a constant table keeps its compiled contents when a save holds other contents", () => {
    const source = `const CONFIG = { n = 1 }
-> main
scene main
  & local alias = CONFIG
  First.
  Second {CONFIG.n} {alias.n} {rawequal(alias, CONFIG)}.
  fin
end
`;
    const { story, compiledJson, errorMessages } =
      makeRuntimeStoryFromSource(source);
    const errors = [...errorMessages];
    expect(story.Continue()).toBe("First.\n");
    // A save whose copy of the constant differs from the compiled one, as a
    // save written by an earlier version of the program would.
    const saved = JSON.parse(story.state.ToJson());
    let changed = 0;
    const visit = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(visit);
      if (!node || typeof node !== "object") return;
      const obj = node as Record<string, any>;
      if (obj["anchor"] === '["CONFIG"]' && obj["obj"]) {
        obj["obj"]["n"] = 5;
        changed++;
      }
      Object.values(obj).forEach(visit);
    };
    visit(saved);
    expect(changed).toBe(1);
    const again = testStory(compiledJson as Record<string, any>);
    again.onError = (m: string) => errors.push(m);
    again.state.LoadJson(JSON.stringify(saved));
    expect(again.ContinueMaximally()).toBe("Second 1 1 true.\n");
    expect(errors).toEqual([]);
  });

  test("a store's frozen new instance is still frozen after a load", () => {
    const run = saveAfterFirstLine(`define Box with
  store n = 1
end
store box = new Box()
-> main
scene main
  & table.freeze(box)
  First.
  Second {table.isfrozen(box)}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond true.\n");
  });

  test("a store table a define holds stays one table in a program whose stores were reordered", () => {
    const scene = `define Holder with
  alias = b
end
-> main
scene main
  & a = b
  First.
  & b.n = 2
  Second {Holder.alias.n} {rawequal(Holder.alias, b)}.
  fin
end
`;
    const before = makeRuntimeStoryFromSource(
      `store a = nil\nstore b = { n = 1 }\n${scene}`,
    );
    const after = makeRuntimeStoryFromSource(
      `store b = { n = 1 }\nstore a = nil\n${scene}`,
    );
    const errors = [...before.errorMessages, ...after.errorMessages];
    expect(before.story.Continue()).toBe("First.\n");
    const json = before.story.state.ToJson();
    const loaded = testStory(after.compiledJson as Record<string, any>);
    loaded.onError = (m: string) => errors.push(m);
    loaded.state.LoadJson(json);
    expect(loaded.ContinueMaximally()).toBe("Second 2 true.\n");
    expect(errors).toEqual([]);
  });

  test("a key that looks like a metatable edge stays its own table after a load", () => {
    const run = saveAfterFirstLine(`store t = setmetatable({ ["#mt"] = { n = 1 }, ["@mt"] = { n = 3 } }, { n = 2 })
-> main
scene main
  First.
  Second {t["#mt"].n} {t["@mt"].n} {getmetatable(t).n} {rawequal(t["#mt"], getmetatable(t))}.
  fin
end
`);
    expect(run.errors).toEqual([]);
    expect(run.first + run.rest).toBe("First.\nSecond 1 3 2 false.\n");
  });

  test("a store that holds a constant's table keeps the edited program's constant", () => {
    const scene = `-> main
scene main
  First.
  Second {C.n} {rawequal(alias, C)}.
  fin
end
`;
    const before = makeRuntimeStoryFromSource(
      `const C = { n = 1 }\nstore alias = C\n${scene}`,
    );
    const after = makeRuntimeStoryFromSource(
      `const C = { n = 2 }\nstore alias = C\n${scene}`,
    );
    const errors = [...before.errorMessages, ...after.errorMessages];
    expect(before.story.Continue()).toBe("First.\n");
    const json = before.story.state.ToJson();
    const loaded = testStory(after.compiledJson as Record<string, any>);
    loaded.onError = (m: string) => errors.push(m);
    loaded.state.LoadJson(json);
    expect(loaded.ContinueMaximally()).toBe("Second 2 true.\n");
    expect(errors).toEqual([]);
  });

  test("an anchor naming a table by another path init gave it still resolves to that table", () => {
    const source = `store a = { n = 1 }
define Holder with
  alias = a
end
-> main
scene main
  First.
  & a.n = 2
  Second {Holder.alias.n} {rawequal(Holder.alias, a)}.
  fin
end
`;
    const { story, compiledJson, errorMessages } =
      makeRuntimeStoryFromSource(source);
    const errors = [...errorMessages];
    expect(story.Continue()).toBe("First.\n");
    // A save that names the shared table by the define's path rather than
    // the store's, as a program whose globals are declared differently
    // would write.
    const saved = story.state.ToJson();
    expect(saved).toContain(`"anchor":"[\\"a\\"]"`);
    const renamed = saved
      .split(`"anchor":"[\\"a\\"]"`)
      .join(`"anchor":"[\\"Holder\\",\\".alias\\"]"`);
    const loaded = testStory(compiledJson as Record<string, any>);
    loaded.onError = (m: string) => errors.push(m);
    loaded.state.LoadJson(renamed);
    expect(loaded.ContinueMaximally()).toBe("Second 2 true.\n");
    expect(errors).toEqual([]);
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
