// Phase 3 I4: reactive `for` lists (positional reconcile).
//
// A `for item in items do … end` mounts one rendered item per iterable element
// inside a persistent wrapper. Body bindings read the loop variable as an
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

  test("positional update: changed element re-renders its slot in place", async () => {
    const h = createHarness(
      `store items = {10, 20, 30}
function change()
  items = {99, 20, 30}
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
    run(h, "change");
    refresh(h);
    // Slot 0 updates in place (no create/destroy churn for an in-place change).
    const update = h
      .snapshotFiltered("ui/update")
      .find(
        (m: any) =>
          typeof m.params?.content?.text === "string" &&
          m.params.content.text === "n=99",
      );
    expect(update).toBeTruthy();
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
