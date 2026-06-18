// Phase 3 I4: reactive `for` lists (positional reconcile).
//
// A `for item in items do … end` mounts one rendered run per iterable element
// directly into the parent at the region's slot (wrapperless). Body bindings
// read the loop variable as an
// evaluator parameter (the compiler emits Binding.params; the runtime passes
// each row's value as an arg — including raw Luau table elements). On the coarse
// per-turn boundary the list is reconciled POSITIONALLY: slot i is updated in
// place, new tail items appended, removed tail items dropped. (Keyed reconcile +
// MoveElement so reorders move retained nodes are Phase 4.)

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const spanTexts = (msgs: unknown[]): unknown[] =>
  msgs
    .filter((m: any) => m.params?.type === "span")
    .map((m: any) => m.params?.content?.text);

const run = (h: UIHarness, fn: string): void =>
  (h.game.story as any).EvaluateFunction(fn, []);
const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshScreens();

describe("reactive for (Phase 3 I4)", () => {
  test("mounts one item per element, binding the loop variable", async () => {
    const h = createHarness(
      `store items = {10, 20, 30}
screen bag with
  for n in items do
    text "n={n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toEqual(
      expect.arrayContaining(["n=10", "n=20", "n=30"]),
    );
  });

  test("iterates a table of tables with member access", async () => {
    const h = createHarness(
      `store items = { {name = "sword"}, {name = "shield"} }
screen bag with
  for it in items do
    text "{it.name}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toEqual(
      expect.arrayContaining(["sword", "shield"]),
    );
  });

  test("two-variable `for k, v` binds key + value", async () => {
    const h = createHarness(
      `store scores = { alice = 10, bob = 20 }
screen board with
  for name, pts in scores do
    text "{name}={pts}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toEqual(expect.arrayContaining(["alice=10", "bob=20"]));
  });

  test("reordering the same objects moves their subtrees (keyed, no rebuild)", async () => {
    const h = createHarness(
      `store items = { {n = 1}, {n = 2}, {n = 3} }
function reverse()
  items = { items[3], items[2], items[1] }
end
screen bag with
  for it in items do
    text "n={it.n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    run(h, "reverse"); // same table objects, reordered
    refresh(h);
    // Retained items move (ui/move), nothing is created or destroyed, and their
    // unchanged content emits no update.
    expect(h.snapshotFiltered("ui/move").length).toBeGreaterThan(0);
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    expect(h.snapshotFiltered("ui/destroy")).toEqual([]);
  });

  test("a stable MULTI-element-body list emits no moves on an unrelated refresh", async () => {
    // Each iteration renders TWO top-level elements. With the list unchanged, the
    // reorder pass must emit ZERO ui/move — moving run elements relative to each
    // other (not all to one outer anchor) keeps an already-placed run in place.
    const h = createHarness(
      `store tick = 0
store items = { {n = 1}, {n = 2}, {n = 3} }
function nudge()
  tick = tick + 1
end
screen bag with
  for it in items do
    text "a{it.n}"
    text "b{it.n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    run(h, "nudge"); // unrelated global write — items unchanged
    refresh(h);
    expect(h.snapshotFiltered("ui/move")).toEqual([]);
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    expect(h.snapshotFiltered("ui/destroy")).toEqual([]);
  });

  test("reordering a MULTI-element-body list keeps element order correct", async () => {
    const h = createHarness(
      `store items = { {n = 1}, {n = 2}, {n = 3} }
function reverse()
  items = { items[3], items[2], items[1] }
end
screen bag with
  for it in items do
    text "a{it.n}"
    text "b{it.n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    run(h, "reverse");
    refresh(h);
    // No rebuild (keyed reuse), and the runs end in reversed order: a3 b3 a2 b2 a1 b1.
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    expect(h.snapshotFiltered("ui/destroy")).toEqual([]);
  });

  test("changing an object's field reuses its iteration for an in-place update", async () => {
    const h = createHarness(
      `store items = { {n = 1}, {n = 2} }
function bump()
  items[1].n = 99
end
screen bag with
  for it in items do
    text "n={it.n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    h.reset();
    run(h, "bump"); // a field write on the first item's table
    refresh(h);
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) =>
          typeof m.params?.content?.text === "string" &&
          m.params.content.text === "n=99",
      );
    expect(update).toBeTruthy();
    // Identity-stable → reused, not rebuilt.
    expect(h.snapshotFiltered("ui/create")).toEqual([]);
    expect(h.snapshotFiltered("ui/destroy")).toEqual([]);
  });

  test("grow appends a new tail item; shrink drops tail items", async () => {
    const h = createHarness(
      `store items = {10, 20, 30}
function grow()
  items = {10, 20, 30, 40}
end
function shrink()
  items = {10}
end
screen bag with
  for n in items do
    text "n={n}"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;

    h.reset();
    run(h, "grow");
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("n=40");

    h.reset();
    run(h, "shrink");
    refresh(h);
    // Dropped tail items emit destroys (3 remaining → 1).
    expect(h.snapshotFiltered("ui/destroy").length).toBeGreaterThan(0);
  });

  test("empty iterable shows the else arm; filling it mounts items", async () => {
    const h = createHarness(
      `store items = {}
function fill()
  items = {10}
end
screen bag with
  for n in items do
    text "n={n}"
  else
    text "empty"
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("empty");

    h.reset();
    run(h, "fill");
    refresh(h);
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain("n=10");
  });
});
