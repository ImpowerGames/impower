// Three defects that all fail SILENTLY — wrong UI or unbounded growth, never an
// error. Each was reported independently by two separate reviews (#310).
//
// Shared shape: state that is correct at MOUNT and wrong on the second pass.
// None of them can be caught by a test that only mounts once.

import { describe, expect, test } from "vitest";
import { createHarness, type UIHarness } from "./harness/uiTestHarness";

const spanTexts = (msgs: unknown[]): unknown[] =>
  msgs
    .filter((m: any) => m.params?.type === "span")
    .map((m: any) => m.params?.content?.text);

/** Every text the ui has emitted, from CREATE and UPDATE alike.
 *
 *  A refresh does not re-create the element — it sends `ui/update` with a new
 *  `content.text`, wrapped in a `ui/batch`. Reading only create-shaped messages
 *  (`params.type === "span"`) makes a working reactive update look like a
 *  failure, which is exactly what it did on the first run of this file. */
const allTexts = (msgs: unknown[]): unknown[] => {
  const out: unknown[] = [];
  const visit = (m: any): void => {
    if (!m) return;
    if (Array.isArray(m.params?.messages)) {
      m.params.messages.forEach(visit); // ui/batch
      return;
    }
    const text = m.params?.content?.text;
    if (typeof text === "string") {
      out.push(text);
    }
  };
  msgs.forEach(visit);
  return out;
};

const run = (h: UIHarness, fn: string): void =>
  (h.game.story as any).EvaluateFunction(fn, []);
const refresh = (h: UIHarness): void =>
  (h.game.module.ui as any).refreshLayouts();
/** The engine-side `@event` registry — what a click actually dispatches on. */
const handlerIds = (h: UIHarness, event: string): string[] =>
  Object.keys((h.game.module.ui as any)._events?.[event] ?? {});

describe("slot inside a control block", () => {
  // `makeScope` never carried `slots`, and only `mountComponent` assigns it —
  // to the component BODY's scope. Every nested region built a fresh, slot-less
  // scope, so `mountSlot` found nothing and dropped the caller's children with
  // no diagnostic.
  test("a slot inside `if` still renders the caller's children", async () => {
    const h = createHarness(
      `store expanded = true
component card with
  text "title"
  if expanded then
    slot
  end
end
layout main with
  card()
    text "child content"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const texts = spanTexts(h.snapshotFiltered("ui/create"));
    expect(texts).toContain("title");
    // The point of the test: absent before the fix.
    expect(texts).toContain("child content");
  });

  test("a slot inside `for` still renders the caller's children", async () => {
    const h = createHarness(
      `store rows = { 1 }
component card with
  for r in rows do
    slot
  end
end
layout main with
  card()
    text "inside the loop"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(spanTexts(h.snapshotFiltered("ui/create"))).toContain(
      "inside the loop",
    );
  });
});

describe("nested for reuses an iteration", () => {
  // `mountIteration` snapshots the enclosing env with a spread, so each
  // iteration owns a private copy of every OUTER variable, and `bindLoopVars`
  // rewrites only this loop's own bindings. The outer copy stayed frozen at its
  // mount-time value.
  //
  // Fires when the outer collection is REPLACED rather than mutated in place —
  // the common reactive idiom.
  test("outer loop vars re-sync when the outer value is replaced", async () => {
    const h = createHarness(
      `store players = { { name = "A" }, { name = "B" } }
store list = { "one" }
function swap()
  players = { { name = "C" }, { name = "D" } }
end
layout main with
  for k, player in players do
    for x in list do
      text "{player.name}:{x}"
    end
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    expect(allTexts(h.snapshot())).toContain("A:one");

    const seen = h.snapshot().length;
    run(h, "swap");
    refresh(h);

    // Only what the refresh emitted, so a stale row cannot be masked by the
    // original mount's text still sitting earlier in the stream.
    const after = allTexts(h.snapshot().slice(seen));
    // The inner rows must follow the replaced outer value, not keep the old one.
    expect(after).toContain("C:one");
    expect(after).not.toContain("A:one");
  });
});

describe("event handlers are released with their element", () => {
  // `mountEvent` registers `_events[event][el.id]`; `destroyElement` removed the
  // node but never the registration. Structural ids are MONOTONIC
  // (`nextChildIndex` never reuses a number), so each orphan persisted forever,
  // retaining its `scope.env` and — through the handler — the Story.
  test("dropped `for` rows do not leave their handlers behind", async () => {
    const h = createHarness(
      `store rows = { 1, 2, 3 }
function noop()
end
function drop()
  rows = { 1 }
end
layout main with
  for r in rows do
    button "Row" @click=noop
  end
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const before = handlerIds(h, "click");
    expect(before.length).toBe(3);

    run(h, "drop");
    refresh(h);

    const after = handlerIds(h, "click");
    // Two rows went away; their handlers must go with them.
    expect(after.length).toBe(1);
  });
});
