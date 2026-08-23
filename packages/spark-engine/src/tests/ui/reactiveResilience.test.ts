// Three failures of containment in the reactive runtime: one error that took
// out far more than itself, one bookkeeping call that consumed state belonging
// to someone else, and one registry that outlived the ids it was keyed by.

import { describe, expect, test } from "vitest";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const handlerIds = (h: any, event: string): string[] =>
  Object.keys((h.game.module.ui as any)._events?.[event] ?? {});

const allTexts = (msgs: unknown[]): unknown[] => {
  const out: unknown[] = [];
  const visit = (m: any): void => {
    if (!m) return;
    if (Array.isArray(m.params?.messages)) {
      m.params.messages.forEach(visit);
      return;
    }
    const text = m.params?.content?.text;
    if (typeof text === "string") out.push(text);
  };
  msgs.forEach(visit);
  return out;
};

describe("a binding that throws does not blank the preview", () => {
  // `text "{player.stats.hp}"` with `player.stats` nil compiles with zero
  // diagnostics, then threw out of mountTextContent -> constructLayoutsFromAst
  // -> onConnected -> Game.connect -> buildApp. Nothing on that chain catches,
  // so the whole preview went blank with no error surfaced — while the exact
  // same expression in DIALOGUE degrades gracefully.
  test("the rest of the layout still mounts", async () => {
    const h = createHarness(
      `store player = { name = "A" }
layout main with
  text "before"
  text "{player.stats.hp}"
  text "after"
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    await flushMicrotasks(10);

    const texts = allTexts(h.snapshot());
    // The point: the siblings of the bad binding still exist.
    expect(texts).toContain("before");
    expect(texts).toContain("after");
  });
});

describe("opening a layout keeps the beat's other changes", () => {
  // `takeReactiveChanges` is destructive and `applyLayoutInstructions` runs
  // BEFORE `refreshLayouts`, so a beat that wrote a store and opened a layout
  // handed the refresh an empty change-set. Updates are equality-gated on the
  // last emitted value, so the dropped change is never re-derived: the already
  // mounted layout stays stale forever.
  test("an already-mounted layout still updates on the beat that opens another", async () => {
    const h = createHarness(
      `store hp = 100
function hurt()
  hp = 50
end
layout main with
  text "HP: {hp}"
end
layout hud with
  text "HUD"
end
-> start
scene start
  [[open hud]]
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpTo("start");
    h.reset();
    // Belt: assert the flag explicitly so this test stays about what
    // `openLayout` does with the change-set, independent of which path set the
    // flag. (`Game.restoreReactiveTracking` re-asserts it after every
    // story-state replacement — pinned by restoreReactiveTracking.test.ts —
    // so this is defense against future harness reshuffles, not a workaround.)
    (h.game.story as any).variablesState.reactiveDepsEnabled = true;

    // The write happens BEFORE the layout directive is applied — the shape the
    // Coordinator produces for a beat that changes state and opens a layout.
    // The change is now pending in the reactive change-set.
    (h.game.story as any).EvaluateFunction("hurt", []);

    // Display beats until the `[[open hud]]` directive runs:
    // applyLayoutInstructions, then refreshLayouts.
    for (let i = 0; i < 6; i += 1) {
      const beat = h.nextBeat();
      if (!beat) break;
      await h.display(beat, true);
      await flushMicrotasks(10);
      if ((h.game.module.ui as any)._mountedLayouts.has("hud")) break;
    }

    expect((h.game.module.ui as any)._mountedLayouts.has("hud")).toBe(true);
    // The mount must not have eaten the pending change on its way past.
    expect(allTexts(h.snapshot())).toContain("HP: 50");
  });
});

describe("handlers do not outlive the id space they are keyed by", () => {
  // `onConnected` drops `_root`, restarting the deterministic id counters, so
  // every id it mints has been used before. `_events` was cleared only by
  // `onReset`, so a stale entry answered to a re-minted id.
  test("a reconnect drops registrations the new render doesn't re-make", async () => {
    const h = createHarness(
      `function noop()
end
layout main with
  button "Go" @click=noop
end
`,
      0,
      { reactive: true },
    );
    await h.ready;
    const ui: any = h.game.module.ui;
    expect(handlerIds(h, "click").length).toBe(1);

    // Stand in for what a live-preview edit leaves behind: a registration for a
    // handler the author has since DELETED. It cannot be produced by
    // re-registering the same source — ids are deterministic, so a surviving
    // handler just overwrites its own key — which is why the leak needs an edit
    // that removes something, and why a single re-render looks clean.
    ui._events["click"]["stale-from-previous-render"] = () => {};

    // A live-preview edit reconnects the SAME Game — onConnected runs again and
    // restarts the structural id counters, so every id it mints is one that has
    // been handed out before.
    await ui.onConnected();
    await flushMicrotasks(10);

    expect(handlerIds(h, "click")).not.toContain(
      "stale-from-previous-render",
    );
    // The live handler is still registered — the clear is followed by a replay.
    expect(handlerIds(h, "click").length).toBe(1);
  });
});
