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
    expect(texts).toContain("before");
    expect(texts).toContain("after");
  });
});

describe("opening a layout keeps the beat's other changes", () => {
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

scene start
  [[open hud]]
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    (h.game.story as any).variablesState.reactiveDepsEnabled = true;

    (h.game.story as any).EvaluateFunction("hurt", []);

    for (let i = 0; i < 6; i += 1) {
      const beat = h.nextBeat();
      if (!beat) break;
      await h.display(beat, true);
      await flushMicrotasks(10);
      if ((h.game.module.ui as any)._mountedLayouts.has("hud")) break;
    }

    expect((h.game.module.ui as any)._mountedLayouts.has("hud")).toBe(true);
    expect(allTexts(h.snapshot())).toContain("HP: 50");
  });
});

describe("handlers do not outlive the id space they are keyed by", () => {
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

    ui._events["click"]["stale-from-previous-render"] = () => {};

    await ui.onConnected();
    await flushMicrotasks(10);

    expect(handlerIds(h, "click")).not.toContain(
      "stale-from-previous-render",
    );
    expect(handlerIds(h, "click").length).toBe(1);
  });
});
