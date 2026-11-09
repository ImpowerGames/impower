import { describe, expect, test } from "vitest";
import type { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { initialLayouts } from "../../game/core/classes/presenters/textLayouts";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
  MAIN_URI,
  type UIHarness,
} from "./harness/uiTestHarness";

const UNSHOWN = "No open layout shows this text. Open textbox or textstream.";

const NO_INITIAL_LAYOUTS = `define ui as config with
  layouts_initial = { }
end
`;

const OWN_MAIN = `define HERO as character with
  name = "HERO"
end

layout main {
  textbox {
    character_info {
      character_name {
        text
      }
    }
    dialogue {
      text
    }
  }
}
`;

function shown(h: UIHarness, target: string): string {
  const writes = flattenMessages(h.messages).filter(
    (m: any) => m?.method === "ui/write-text" && m.params?.target === target,
  );
  const last: any = writes.at(-1);
  return (last?.params?.instructions ?? [])
    .map((e: any) => e.text ?? "")
    .join("");
}

function lineOf(source: string, text: string): number {
  return source.split("\n").findIndex((l) => l.includes(text));
}

function mounted(h: UIHarness): string[] {
  return [...(h.game.module.ui as any)._mountedLayouts.keys()];
}

async function previewAt(source: string, line: number, loadCheckpoint?: string) {
  const logs: unknown[] = [];
  const h = createHarness(source, line, {
    reactive: true,
    autoOpenAll: false,
    loadCheckpoint,
    connect: false,
  });
  (h.game.context.system as any).log = (message: unknown) => logs.push(message);
  if (!loadCheckpoint) {
    h.game.setStartFrom({ file: MAIN_URI, line });
    h.game.simulate();
    expect(h.game.simulation).toBe("success");
  }
  await h.reconnect();
  await flushMicrotasks(10);
  if (!loadCheckpoint) {
    await h.preview(line);
    await flushMicrotasks(10);
  }
  const unshown = () => logs.filter((m) => m === UNSHOWN).length;
  return { h, logs, unshown };
}

async function playLive(h: UIHarness, settle?: () => Promise<void>) {
  h.jumpToFlow("start");
  let beat = h.nextBeat();
  while (beat) {
    const coordinator = new Coordinator(h.game, beat);
    for (let i = 0; i < 5; i += 1) {
      await (settle ? settle() : flushMicrotasks(5));
      coordinator.onUpdate({ deltaMS: 0 } as Clock);
    }
    beat = h.nextBeat();
  }
}

const playing = (game: any) => {
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

const FONTS = [
  {
    uri: "inmemory:///fancy.ttf",
    type: "font",
    name: "Fancy",
    ext: "ttf",
    src: "/file:/proj/fancy.ttf?v=1",
  } as any,
];

const FANCY_TEXTBOX = `style textbox {
  font_family = "Fancy"
}
`;

describe("the textbox layout and ui.layouts_initial", () => {
  test("an [[open textbox]] in a played beat shows that beat's own line", async () => {
    const h = createHarness(
      `define HERO as character with
  name = "HERO"
end

scene start
  HERO:
    [[open textbox]]
    Shown.
end
`,
      0,
      {
        reactive: true,
        autoOpenAll: false,
        beforeConnect: (game) => {
          game.context.system.previewing = undefined;
          game.context.system.composeBeats = true;
        },
      },
    );
    await h.ready;
    new Coordinator(h.game, {
      end: 0,
      text: { action: [{ text: "Hidden." }] },
      layout: { textbox: [{ control: "close", name: "textbox" }] },
    } as any);
    await flushMicrotasks(30);
    expect(h.game.module.ui.findIds("dialogue")).toEqual([]);
    h.jumpToFlow("start");
    h.reset();
    const beat = h.nextBeat();
    expect(beat?.layout?.["textbox"]?.[0]?.control).toBe("open");
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(10);
      (coordinator as any)._onTick?.(100);
    }
    await flushMicrotasks(20);
    expect(h.game.module.ui.findIds("dialogue")).toHaveLength(1);
    expect(
      flattenMessages(
        h.messages.flatMap((m: any) =>
          m.method === "ui/beat" ? m.params.messages : [m],
        ),
      )
        .filter(
          (m: any) =>
            m.method === "ui/write-text" && m.params.target === "dialogue",
        )
        .map((m: any) => m.params.instructions.map((e: any) => e.text).join("")),
    ).toContain("Shown.");
  });

  test("a line shown while the textbox layout's font loads appears when it mounts", async () => {
    const h = createHarness(`${FANCY_TEXTBOX}\nscene start\n  First line.\nend\n`, 0, {
      reactive: true,
      autoOpenAll: false,
      holdAssets: true,
      assets: FONTS,
    });
    const release = async () => {
      h.releaseAssets();
      await flushMicrotasks(20);
    };
    await release();
    await h.ready;
    await playLive(h, release);
    expect(mounted(h)).toEqual(["main", "textbox"]);
    expect(shown(h, "action")).toBe("First line.");
  });

  test("a choice shown while the textbox layout's font loads can be picked once it mounts", async () => {
    const h = createHarness(
      `${FANCY_TEXTBOX}\nscene start\n  choose\n    + Stay\n      Stayed.\n    + Go\n      Gone.\n  end\nend\n`,
      0,
      { reactive: true, autoOpenAll: false, holdAssets: true, assets: FONTS },
    );
    const release = async () => {
      h.releaseAssets();
      await flushMicrotasks(20);
    };
    await release();
    await h.ready;
    await playLive(h, release);
    expect(mounted(h)).toEqual(["main", "textbox"]);
    expect(h.observedElementIds().length).toBeGreaterThanOrEqual(2);
  });

  test.each([
    [
      "switching from the textbox to another text layout",
      { end: 0, text: { action: [{ text: "First." }] } },
      {
        textbox: [{ control: "close", name: "textbox" }],
        panel: [{ control: "open", name: "panel" }],
      },
    ],
    [
      "closing and reopening the textbox",
      { end: 0, layout: { textbox: [{ control: "close", name: "textbox" }] } },
      {
        textbox: [
          { control: "close", name: "textbox" },
          { control: "open", name: "textbox" },
        ],
      },
    ],
  ])("%s delivers the beat's line to the mounted element", async (_name, first, layout) => {
    const h = createHarness(
      `layout panel {
  action {
    text
  }
}

scene start
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false, beforeConnect: playing },
    );
    await h.ready;
    await displayLive(h, first);
    h.reset();
    await displayLive(h, {
      end: 0,
      text: { action: [{ text: "Shown." }] },
      layout,
    });
    const ids = h.game.module.ui.findIds("action");
    expect(ids).toHaveLength(1);
    const written = flattenMessages(
      h.messages.flatMap((m: any) =>
        m.method === "ui/beat" ? m.params.messages : [m],
      ),
    ).filter(
      (m: any) =>
        m.method === "ui/write-text" &&
        m.params.instructions?.some((e: any) => e.text === "Shown."),
    );
    expect(written.some((m: any) => m.params.elements?.includes(ids[0]))).toBe(
      true,
    );
  });

  test("replacing one of two elements with a target's name delivers the line to the replacement", async () => {
    const h = createHarness(
      `layout main {
  action {
    text
  }
}

scene start
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false, beforeConnect: playing },
    );
    await h.ready;
    const ui = h.game.module.ui;
    await displayLive(h, {
      end: 0,
      layout: { textbox: [{ control: "open", name: "textbox" }] },
    });
    expect(ui.findIds("action")).toHaveLength(2);
    h.reset();
    await displayLive(h, {
      end: 0,
      text: { action: [{ text: "After replacement." }] },
      layout: {
        textbox: [
          { control: "close", name: "textbox" },
          { control: "open", name: "textbox" },
        ],
      },
    });
    const ids = ui.findIds("action");
    expect(ids).toHaveLength(2);
    const written = flattenMessages(
      h.messages.flatMap((m: any) =>
        m.method === "ui/beat" ? m.params.messages : [m],
      ),
    )
      .filter(
        (m: any) =>
          m.method === "ui/write-text" &&
          m.params.instructions?.some(
            (e: any) => e.text === "After replacement.",
          ),
      )
      .flatMap((m: any) => m.params.elements ?? []);
    for (const id of ids) {
      expect(written).toContain(id);
    }
  });

  test("a font cancelled by a navigate does not hold back the destination's line", async () => {
    const h = createHarness(
      `${FANCY_TEXTBOX}
layout panel {
  action {
    text
  }
}

scene start
  Hello.
end
`,
      0,
      {
        reactive: true,
        autoOpenAll: false,
        holdAssets: true,
        assets: FONTS,
        beforeConnect: playing,
      },
    );
    await h.ready;
    await displayLive(h, {
      end: 0,
      text: { action: [{ text: "Panel is ready." }] },
      layout: { panel: [{ control: "navigate", name: "panel" }] },
    });
    expect(h.heldAssetLoadCount()).toBeGreaterThan(0);
    expect(mounted(h)).toEqual(["main", "panel"]);
    const ids = h.game.module.ui.findIds("action");
    expect(ids).toHaveLength(1);
    const written = flattenMessages(
      h.messages.flatMap((m: any) =>
        m.method === "ui/beat" ? m.params.messages : [m],
      ),
    )
      .filter(
        (m: any) =>
          m.method === "ui/write-text" &&
          m.params.instructions?.some((e: any) => e.text === "Panel is ready."),
      )
      .flatMap((m: any) => m.params.elements ?? []);
    expect(written).toContain(ids[0]);
  });

  test("a navigate cancels an initial textbox still waiting for its font", async () => {
    const h = createHarness(
      `${FANCY_TEXTBOX}
layout panel {
  label {
    text "Menu"
  }
}

scene start
  [[navigate to panel]]
  Unseen.
end
`,
      0,
      {
        reactive: true,
        autoOpenAll: false,
        holdAssets: true,
        assets: FONTS,
        beforeConnect: playing,
      },
    );
    await h.ready;
    h.jumpToFlow("start");
    const coordinator = new Coordinator(h.game, h.nextBeat()!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate({ deltaMS: 100 } as Clock);
    }
    expect(h.heldAssetLoadCount()).toBeGreaterThan(0);
    h.releaseAssets();
    await flushMicrotasks(100);
    expect(mounted(h)).toEqual(["main", "panel"]);
  });

  test("an observation cancelled while the layout waits for its font never fires", async () => {
    const h = createHarness(
      `${FANCY_TEXTBOX}
scene start
  Hello.
end
`,
      0,
      {
        reactive: true,
        autoOpenAll: false,
        holdAssets: true,
        assets: FONTS,
        beforeConnect: playing,
      },
    );
    await h.ready;
    const ui = h.game.module.ui;
    const opening = ui.applyLayoutInstructions(
      [{ control: "open", name: "textbox" }],
      true,
    );
    await flushMicrotasks(20);
    expect(h.heldAssetLoadCount()).toBeGreaterThan(0);
    let calls = 0;
    ui.observe("click", "choice 0", () => {
      calls += 1;
    });
    ui.unobserve("click", "choice 0");
    h.releaseAssets();
    await opening;
    await flushMicrotasks(40);
    const ids = ui.findIds("choice 0");
    expect(ids).toHaveLength(1);
    h.emitEvent("click", ids[0]!, { button: 0 });
    await flushMicrotasks(20);
    expect(calls).toBe(0);
  });

  test("a navigate that closes the only text layout reports the unshown text", async () => {
    const logs: unknown[] = [];
    const h = createHarness(
      `screen menu {
}

layout textbox in menu {
  action {
    text
  }
}

layout panel in menu {
  label {
    text "Menu"
  }
}

scene start
  Hello.
end
`,
      0,
      { reactive: true, autoOpenAll: false },
    );
    (h.game.context.system as any).log = (message: unknown) => logs.push(message);
    await h.ready;
    new Coordinator(h.game, {
      end: 0,
      text: { action: [{ text: "First." }] },
    } as any);
    await flushMicrotasks(20);
    expect(h.game.module.ui.findIds("action")).toHaveLength(1);
    new Coordinator(h.game, {
      end: 0,
      text: { action: [{ text: "Unseen." }] },
      layout: { panel: [{ control: "navigate", screen: "menu", name: "panel" }] },
    } as any);
    await flushMicrotasks(30);
    expect(h.game.module.ui.findIds("action")).toEqual([]);
    expect(logs).toContain(UNSHOWN);
  });

  test("with the default layouts_initial a dialogue line shows in the textbox layout", async () => {
    const { h, unshown } = await previewAt(
      `scene start\n  Hello there.\nend\n`,
      1,
    );
    expect(mounted(h)).toEqual(["main", "textbox"]);
    expect(shown(h, "action")).toBe("Hello there.");
    expect(unshown()).toBe(0);
  });

  test("with layouts_initial = { } no text shows and the play log says so once", async () => {
    const { h, unshown } = await previewAt(
      `${NO_INITIAL_LAYOUTS}\nscene start\n  First line.\n  Second line.\nend\n`,
      6,
    );
    expect(mounted(h)).toEqual(["main"]);
    expect(h.game.module.ui.findIds("dialogue")).toEqual([]);
    expect(shown(h, "action")).toBe("");
    expect(unshown()).toBe(1);
  });

  test("[[close textbox]] hides the next line and [[open textbox]] shows the one after", async () => {
    const source = `scene start
  First.
  [[close textbox]]
  Hidden.
  [[open textbox]]
  Shown.
end
`;
    const closed = await previewAt(source, 3);
    expect(mounted(closed.h)).toEqual(["main"]);
    expect(shown(closed.h, "action")).toBe("");
    expect(closed.unshown()).toBe(1);

    const reopened = await previewAt(source, 5);
    expect(mounted(reopened.h)).toEqual(["main", "textbox"]);
    expect(shown(reopened.h, "action")).toBe("Shown.");
  });

  test("a project's own layout main holding the dialogue elements shows dialogue and opens main only", async () => {
    const source = `${OWN_MAIN}\nscene start\n  HERO: Hi there.\nend\n`;
    const { h, unshown } = await previewAt(
      source,
      lineOf(source, "Hi there."),
    );
    expect(initialLayouts(h.game)).toEqual(["main"]);
    expect(mounted(h)).toEqual(["main"]);
    expect(shown(h, "character_name")).toBe("HERO");
    expect(shown(h, "dialogue")).toBe("Hi there.");
    expect(unshown()).toBe(0);
  });

  test("the default project opens main and textbox at the start", async () => {
    const { h } = await previewAt(`scene start\n  Hello.\nend\n`, 1);
    expect(initialLayouts(h.game)).toEqual(["main", "textbox"]);
  });

  test("an overlay in layouts_initial opens beside textbox even when it holds a text element", async () => {
    const source = `define ui as config with
  layouts_initial = { "textbox", "inventory" }
end

layout inventory {
  title {
    text "Inventory"
  }
}

scene start
  Hello.
end
`;
    const { h } = await previewAt(source, lineOf(source, "Hello."));
    expect(initialLayouts(h.game)).toEqual(["main", "textbox", "inventory"]);
    expect(mounted(h)).toEqual(["main", "textbox", "inventory"]);
  });

  test("an overlay in layouts_initial opens beside a project's own main while the built-in textbox is skipped", async () => {
    const source = `define ui as config with
  layouts_initial = { "textbox", "inventory" }
end

${OWN_MAIN}
layout inventory {
  title {
    text "Inventory"
  }
}

scene start
  HERO: Hello.
end
`;
    const { h } = await previewAt(source, lineOf(source, "HERO: Hello."));
    expect(initialLayouts(h.game)).toEqual(["main", "inventory"]);
    expect(mounted(h)).toEqual(["main", "inventory"]);
    expect(shown(h, "dialogue")).toBe("Hello.");
  });

  test("an explicit [[open textbox]] still opens the built-in layout beside a project's own main", async () => {
    const source = `${OWN_MAIN}\nscene start\n  HERO: Hi.\n  [[open textbox]]\n  HERO: Again.\nend\n`;
    const { h } = await previewAt(source, lineOf(source, "Again."));
    expect(mounted(h)).toEqual(["main", "textbox"]);
  });

  test("restoring a checkpoint taken after [[close textbox]] leaves it closed", async () => {
    const source = `scene start
  First.
  [[close textbox]]
  Hidden.
  Still hidden.
end
`;
    const before = await previewAt(source, 3);
    expect(mounted(before.h)).toEqual(["main"]);
    const json = before.h.game.checkpointJson(
      before.h.game.newestCheckpoint(),
    );
    expect(json).toBeTruthy();

    const restored = await previewAt(source, 3, json!);
    expect(restored.h.game.module.ui.initialLayoutsOpened).toBe(true);
    expect(restored.h.game.module.ui.openedLayoutsAfter([])).toEqual(["main"]);
    expect(mounted(restored.h)).toEqual(["main"]);
    restored.h.game.start();
    await flushMicrotasks(10);
    expect(mounted(restored.h)).toEqual(["main"]);
    expect(shown(restored.h, "action")).toBe("");
  });

  test("with no open text layout a beat's image cue and layout directives still apply", async () => {
    const source = `define BG as image with
  src = "https://example.com/bg.png"
end

layout hud {
  stats {
    text "HP"
  }
}

scene start
  First.
  [[close textbox]]
  [[show backdrop BG]]
  [[open hud]]
  Unseen.
end
`;
    const { h, unshown } = await previewAt(source, lineOf(source, "Unseen."));
    expect(mounted(h)).toEqual(["main", "hud"]);
    expect((h.game.module.ui as any)._state.image?.backdrop).toBeTruthy();
    expect(shown(h, "action")).toBe("");
    expect(unshown()).toBe(1);
  });

  test("a choice with no open text layout waits for a pick and the play log says so", async () => {
    const source = `${NO_INITIAL_LAYOUTS}\nscene start\n  choose\n    * [Stay.]\n      Stayed.\n    * [Leave.]\n      Left.\n  end\nend\n`;
    const { h, unshown } = await previewAt(source, 5);
    expect(h.game.story.currentChoices.map((c) => c.text)).toEqual([
      "Stay.",
      "Leave.",
    ]);
    expect(h.game.module.ui.findIds("choice")).toEqual([]);
    expect(unshown()).toBe(1);
  });
});
