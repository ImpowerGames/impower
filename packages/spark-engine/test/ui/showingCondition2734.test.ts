import { describe, expect, test, vi } from "vitest";
import type { Clock } from "../../src/game/core/classes/Clock";
import { Coordinator } from "../../src/game/core/classes/Coordinator";
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

const marked = (h: UIHarness): string[] | undefined => {
  const sent = showings(h);
  if (sent.length === 0) {
    return undefined;
  }
  const counts = new Map<string, number>();
  for (const { params } of sent) {
    if (params.reset) {
      counts.clear();
    }
    for (const [name, change] of Object.entries(params.changes as Record<string, number>)) {
      counts.set(name, (counts.get(name) ?? 0) + change);
    }
  }
  return [...counts].filter(([, count]) => count > 0).map(([name]) => name).sort();
};

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

async function play(source: string, opts?: { holdExits?: boolean }) {
  const h = createHarness(source, 0, { reactive: true, autoOpenAll: false, beforeConnect: live, ...opts });
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

  test("a name written with tabs around it inside the parentheses is watched", async () => {
    const h = createHarness(SOURCE.replace("@showing(hud)", "@showing(\thud\t)"), 0, {
      reactive: true,
      autoOpenAll: false,
    });
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud");
    await flushMicrotasks(10);
    expect(marked(h)).toEqual(["hud"]);
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
    const sent = new Set(showings(h).flatMap((m: any) => Object.keys(m.params.changes)));
    expect([...sent].sort()).toEqual(["action", "dialogue", "hud"]);
  });

  test("a game whose styles never test @showing sends no mark", async () => {
    const { h } = await play(SOURCE.replace(/style frame \{[^]*?\n\}\n/, ""));
    expect(showings(h)).toEqual([]);
  });

  test("an element with content declared in its layout is marked while it is on screen", async () => {
    const source = `layout overlay {
  badge {
    text "Status"
  }
  empty_slot #clear {
    text
  }
}

style frame {
  @showing(badge) {
    opacity = 1
  }
  @showing(text) {
    opacity = 1
  }
  @showing(empty_slot) {
    opacity = 1
  }
}

scene start
  Hello.
end
`;
    const h = createHarness(source, 0, { reactive: true, autoOpenAll: false });
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    expect(ui.showingNames()).toEqual([]);
    await ui.openLayout("overlay");
    await flushMicrotasks(10);
    expect(marked(h)).toEqual(["badge", "text"]);
    ui.hide("badge");
    await flushMicrotasks(10);
    expect(marked(h)).toEqual([]);
    ui.show("badge");
    await flushMicrotasks(10);
    expect(marked(h)).toEqual(["badge", "text"]);
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
    expect(cleared?.params).toEqual({ changes: { hud: -1 }, retired: true });
  });

  const portraitScene = (lines: string) => `define SPRITE as image with
  src = "https://example.com/hero.png"
end

layout main {
  stage {
    portrait #clear {
      image
    }
  }
}

style frame {
  @showing(portrait) {
    opacity = 1
  }
}

scene start
${lines}
end
`;

  const removals = (h: UIHarness, name: string) =>
    showings(h).filter((m: any) => (m.params.changes[name] ?? 0) < 0);

  test("a picture hidden with an exit animation counts as showing until the renderer reports its exit ended (#2777)", async () => {
    const { h, marks } = await play(
      portraitScene(`  [[show portrait SPRITE]] Hello.
  [[hide portrait with fadeout over 0.5s]] Bye.`),
      { holdExits: true },
    );
    expect(marks).toEqual([["portrait"], ["portrait"]]);
    expect(removals(h, "portrait")).toEqual([]);
    expect(h.releaseExits()).toBe(1);
    await flushMicrotasks(10);
    expect(marked(h)).toEqual([]);
  });

  test("a picture whose exit report comes back as an error leaves the mark and the error is reported (#2777)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { h, marks } = await play(
        portraitScene(`  [[show portrait SPRITE]] Hello.
  [[hide portrait with fadeout over 0.5s]] Bye.`),
        { holdExits: true },
      );
      expect(marks).toEqual([["portrait"], ["portrait"]]);
      const [held] = h.heldExits();
      h.game.connection.receive({
        jsonrpc: "2.0",
        id: held.id,
        method: held.method,
        error: { code: -32603, message: "the exit could not play" },
      } as any);
      await flushMicrotasks(10);
      expect(marked(h)).toEqual([]);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("the exit could not play"));
    } finally {
      warn.mockRestore();
    }
  });

  test("a picture hidden again while its exit plays counts as showing until the last exit is reported ended (#2777)", async () => {
    const { h, marks } = await play(
      portraitScene(`  [[show portrait SPRITE]] Hello.
  [[hide portrait with fadeout over 0.5s]] Going.
  [[hide portrait with fadeout over 2s]] Gone.`),
      { holdExits: true },
    );
    expect(marks).toEqual([["portrait"], ["portrait"], ["portrait"]]);
    expect(h.releaseExits(1)).toBe(1);
    await flushMicrotasks(10);
    expect(marked(h)).toEqual(["portrait"]);
    expect(h.releaseExits()).toBe(1);
    await flushMicrotasks(10);
    expect(marked(h)).toEqual([]);
  });

  test("a picture shown and hidden with an exit animation in one line counts as showing until its exit is reported ended (#2777)", async () => {
    const { h, marks } = await play(
      portraitScene(`  [[show portrait SPRITE]] Hello [[hide portrait with fadeout over 0.5s]] there.`),
      { holdExits: true },
    );
    expect(marks).toEqual([["portrait"]]);
    expect(h.releaseExits()).toBe(1);
    await flushMicrotasks(10);
    expect(marked(h)).toEqual([]);
  });

  test("a line cleared through its @hide leaves the mark, with what it holds, when its hide starts", async () => {
    const h = createHarness(
      `define ui as config with
  layouts_initial = { }
end

layout main {
  action #clear {
    text
    badge {
      text = "!"
    }
  }
  dialogue #clear {
    text
  }
}

style action {
  @hide { opacity = 0 }
}

style frame {
  @showing(action) {
    opacity = 1
  }
  @showing(badge) {
    opacity = 1
  }
}
`,
      0,
      { reactive: true, autoOpenAll: false, holdPresence: true, beforeConnect: live },
    );
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    const [action] = ui.findIds("action");
    ui.setMotion(true);
    await ui.text.change("line write", "action", [{ text: "The door opens." }], false);
    h.releasePresence();
    await flushMicrotasks(30);
    expect(ui.showingNames()).toEqual(expect.arrayContaining(["action", "badge"]));
    h.reset();
    void ui.text.change("line replace", ["action"]);
    await flushMicrotasks(10);
    const hides = wire(h.messages)
      .filter((m: any) => m?.method === "ui/presence")
      .flatMap((m: any) => m.params.effects)
      .filter((effect: any) => effect.element === action && effect.presence === "hide");
    expect(hides).toHaveLength(1);
    expect(ui.showingNames()).not.toContain("action");
    expect(ui.showingNames()).not.toContain("badge");
    h.releasePresence();
    await flushMicrotasks(30);
    expect(ui.showingNames()).not.toContain("badge");
  });

  test("an element written in a leaving layout counts as showing until the layout is removed", async () => {
    const source = `layout overlay {
  badge #clear {
    text
  }
}

style frame {
  @showing(overlay) {
    opacity = 1
  }
  @showing(badge) {
    opacity = 1
  }
  @showing(text) {
    opacity = 1
  }
}

scene start
  Hello.
end
`;
    const h = createHarness(source, 0, { reactive: true, autoOpenAll: false, beforeConnect: live });
    await h.ready;
    await flushMicrotasks(10);
    const ui: any = h.game.module.ui;
    await ui.openLayout("overlay");
    await flushMicrotasks(10);
    expect(ui.showingNames()).toEqual(["overlay"]);
    await ui.text.change("line write", "badge", [{ text: "Status" }], true);
    await flushMicrotasks(10);
    expect(ui.showingNames()).toEqual(["badge", "overlay", "text"]);
    expect(ui.beginCompose()).toBe(true);
    void ui.closeLayout("overlay", { with: "fadeout", over: 0.5 });
    await flushMicrotasks(10);
    expect(ui._retiring.size).toBe(1);
    expect(ui.showingNames()).toEqual(["badge", "overlay", "text"]);
    await ui.text.change("line replace", ["badge"]);
    await flushMicrotasks(10);
    expect(ui.showingNames()).toEqual(["badge", "overlay", "text"]);
    const [retiring] = [...ui._retiring];
    h.reset();
    ui.retire(retiring);
    expect(ui.showingNames()).toEqual([]);
    expect(showings(h).at(-1)?.params).toEqual({
      changes: { badge: -1, overlay: -1, text: -1 },
      retired: true,
    });
  });
});
