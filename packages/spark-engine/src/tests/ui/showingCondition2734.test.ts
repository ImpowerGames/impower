import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flushMicrotasks, type UIHarness } from "./harness/uiTestHarness";

const SOURCE = `define HERO as character with
  name = "HERO"
end

define ui as config with
  layouts_initial = { "textbox" }
end

layout hud {
  frame {
    text = HUD
  }
}

style frame {
  @showing(action) {
    background-color = neutral_95
  }
  @showing(dialogue) {
    background-color = neutral_90
  }
  @showing(hud) {
    opacity = 1
  }
}

scene start
  HERO:
    Hello.
  The door opens.
  [[open hud]] The wind blows.
  HERO:
    [[close hud]]
    Bye.
end
`;

function wire(messages: any[]): any[] {
  return messages.flatMap((m: any) =>
    (m?.method === "ui/batch" || m?.method === "ui/beat") && Array.isArray(m.params?.messages)
      ? wire(m.params.messages)
      : [m],
  );
}

const showings = (h: UIHarness): any[] => wire(h.messages).filter((m: any) => m?.method === "ui/showing");

const marked = (h: UIHarness): string[] | undefined => showings(h).at(-1)?.params?.names;

const live = (game: any) => {
  game.context.system.previewing = undefined;
  game.context.system.composeBeats = true;
};

async function displayLive(h: UIHarness, beat: any) {
  const coordinator = new Coordinator(h.game, beat);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks(20);
    coordinator.onUpdate({ deltaMS: 100 } as Clock);
  }
  await flushMicrotasks(30);
}

async function play(source: string) {
  const h = createHarness(source, 0, { reactive: true, autoOpenAll: false, beforeConnect: live });
  await h.ready;
  await flushMicrotasks(10);
  h.jumpToFlow("start");
  const marks: (string[] | undefined)[] = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    await displayLive(h, beat);
    marks.push(marked(h));
  }
  return { h, marks };
}

describe("the engine marks what is on screen for @showing (#2734)", () => {
  test("a text element is marked while it holds its line, and a layout while it is open or leaving", async () => {
    const { h, marks } = await play(SOURCE);
    const ui: any = h.game.module.ui;
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    expect(ui._retiring.size).toBe(1);
    expect(marks).toEqual([["dialogue"], ["action"], ["action", "hud"], ["dialogue", "hud"]]);
  });

  test("a layout closed at once is cleared with its close", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud");
    await flushMicrotasks(10);
    expect(marked(h)).toEqual(["hud"]);
    await ui.closeLayout("hud", undefined, true);
    await flushMicrotasks(10);
    expect(marked(h)).toEqual([]);
  });

  test("only names some style tests with @showing are sent", async () => {
    const { h } = await play(SOURCE);
    const sent = new Set(showings(h).flatMap((m: any) => m.params.names));
    expect([...sent].sort()).toEqual(["action", "dialogue", "hud"]);
  });

  test("a game whose styles never test @showing sends no mark", async () => {
    const { h } = await play(SOURCE.replace(/style frame \{[^]*?\n\}\n/, ""));
    expect(showings(h)).toEqual([]);
  });

  test("a layout leaving with an exit animation counts as showing until it is removed", async () => {
    const h = createHarness(SOURCE, 0, { reactive: true, autoOpenAll: false, beforeConnect: live });
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud");
    await flushMicrotasks(10);
    expect(ui.showingNames()).toEqual(["hud"]);
    expect(ui.beginCompose()).toBe(true);
    void ui.closeLayout("hud", { with: "fadeout", over: 0.5 });
    await flushMicrotasks(10);
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    expect(ui._retiring.size).toBe(1);
    expect(ui.showingNames()).toEqual(["hud"]);
    const [retiring] = [...ui._retiring];
    h.reset();
    ui.retire(retiring);
    expect(ui.showingNames()).toEqual([]);
    const cleared = showings(h).at(-1);
    expect(cleared?.params).toEqual({ names: [], retired: true });
  });
});
