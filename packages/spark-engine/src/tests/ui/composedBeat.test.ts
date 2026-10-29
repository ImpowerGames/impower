import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, test, vi } from "vitest";
import { type Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { type Game } from "../../game/core/classes/Game";
import {
  createHarness,
  flattenMessages,
  flushMicrotasks,
} from "./harness/uiTestHarness";

const LAYOUT = `define HERO as character with
  name = "HERO"
end

layout main with
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
end
`;

const STORY = `${LAYOUT}
-> start

scene start
  HERO: The first line.

  HERO: The second line.
end
`;

const FONTS: File[] = [
  {
    uri: "inmemory:///fancy.ttf",
    type: "font",
    name: "Fancy",
    ext: "ttf",
    src: "/file:/proj/fancy.ttf?v=1",
  } as File,
];

const hudStory = (directives: string) => `style hud with
  font_family = "Fancy"
end

layout hud with
  stats {
    text
  }
end

${LAYOUT}
-> start

scene start
  HERO:
    ${directives}
    The first line.
end
`;

const composing = (game: Game) => {
  game.context.system.composeBeats = true;
};

const playing = (game: Game) => {
  composing(game);
  game.context.system.previewing = undefined;
};

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const beats = (messages: any[]) =>
  messages.filter((m) => m.method === "ui/beat").map((m) => m.params);

const opsOf = (beat: any) => flattenMessages(beat.messages);

const writesOf = (beat: any, target: string) =>
  opsOf(beat)
    .filter((m: any) => m.method === "ui/write-text" && m.params.target === target)
    .map((m: any) => m.params);

const screenOps = (messages: any[]) =>
  flattenMessages(messages).filter(
    (m) => m.method?.startsWith("ui/") && m.method !== "ui/beat",
  );

async function play(h: ReturnType<typeof createHarness>, settle?: () => Promise<void>) {
  const beat = h.nextBeat();
  expect(beat).toBeTruthy();
  const coordinator = new Coordinator(h.game, beat!);
  for (let i = 0; i < 10; i += 1) {
    await (settle ? settle() : flushMicrotasks());
    coordinator.onUpdate(tick());
  }
  await (settle ? settle() : flushMicrotasks(10));
}

async function releaseFonts(h: ReturnType<typeof createHarness>) {
  for (let i = 0; i < 5; i += 1) {
    h.releaseAssets();
    await flushMicrotasks(20);
  }
}

describe("a composed display (#1820)", () => {
  test("a preview's display reaches the page as one beat, at its sweep", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    expect(screenOps(h.messages)).toEqual([]);
    expect(beats(h.messages)).toEqual([]);

    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(10);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(beat.sweep).toBe(true);
    expect(beat.time).toBeUndefined();
    expect(beat.messages[0].method).toBe("ui/reconcile-begin");
    expect(opsOf(beat).some((m: any) => m.method === "ui/create")).toBe(true);
    expect(writesOf(beat, "dialogue").map((w: any) => w.instructions)).toEqual([[]]);
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("a played beat reaches the page as one beat, stamped with its start", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(typeof beat.time).toBe("number");
    for (const target of ["dialogue", "character_name"]) {
      const writes = writesOf(beat, target);
      expect(writes.map((w: any) => w.instructions.length > 0)).toEqual([false, true]);
      expect(typeof writes[1].time).toBe("number");
    }
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("a target cleared, written, cleared and written again keeps each op in its place", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    const ui = h.game.module.ui;
    void ui.text.clear("dialogue");
    void ui.text.write("dialogue", [{ text: "B" } as any], true);
    void ui.text.clear("dialogue");
    void ui.text.write("dialogue", [{ text: "A" } as any], true);
    ui.sweepReconcile();
    await flushMicrotasks(10);

    const [beat] = beats(h.messages);
    expect(writesOf(beat, "dialogue").map((w: any) => w.instructions).slice(-4)).toEqual([
      [],
      [{ text: "B" }],
      [],
      [{ text: "A" }],
    ]);
  });

  test("a display a newer connect takes over never reaches the page, PLAY's included", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: composing });
    await h.ready;
    void h.game.module.ui.text.write("dialogue", [{ text: "ABANDONED" } as any], true);
    await flushMicrotasks(10);

    h.game.context.system.previewing = undefined;
    await h.reconnect();
    await flushMicrotasks(20);

    expect(JSON.stringify(h.messages)).not.toContain("ABANDONED");
    expect(screenOps(h.messages).some((m) => m.method === "ui/create")).toBe(true);
  });
});

describe("a composed beat that opens a layout whose font is loading (#1820)", () => {
  test("waits for the layout's mount and carries it", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h, async () => {
      await flushMicrotasks(20);
    });
    expect(beats(h.messages)).toEqual([]);

    await releaseFonts(h);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    expect(opsOf(beat).some((m: any) => m.method === "ui/create" && m.params.name === "hud")).toBe(true);
    expect(writesOf(beat, "dialogue").some((w: any) => w.instructions.length > 0)).toBe(true);
    expect(screenOps(h.messages)).toEqual([]);
  });

  test("waits for a mount a directive before it holds back", async () => {
    const h = createHarness(hudStory("[[close hud]] [[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h, async () => {
      await flushMicrotasks(20);
    });
    await releaseFonts(h);

    const [beat] = beats(h.messages);
    expect(beat).toBeTruthy();
    expect(opsOf(beat).some((m: any) => m.method === "ui/create" && m.params.name === "hud")).toBe(true);
    expect(screenOps(h.messages).some((m) => m.params?.name === "hud")).toBe(false);
  });

  test("makes no mount once a newer connect has begun", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    const before = h.game.save() as string;
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    h.game.load(before);
    void h.reconnect();
    await flushMicrotasks(20);
    const mark = h.messages.length;
    await releaseFonts(h);

    const after = h.messages.slice(mark);
    const ops = [
      ...screenOps(after),
      ...beats(after).flatMap((b) => opsOf(b)),
    ];
    expect(ops.some((m) => m.method === "ui/create" && m.params?.name === "hud")).toBe(false);
  });

  test("a directive chain a newer connect superseded makes no later mount (#1218)", async () => {
    const h = createHarness(hudStory("[[open hud]] [[close hud]] [[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    const before = h.game.save() as string;
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    h.game.load(before);
    void h.reconnect();
    await flushMicrotasks(20);
    const mark = h.messages.length;
    await releaseFonts(h);

    const after = h.messages.slice(mark);
    const ops = [
      ...screenOps(after),
      ...beats(after).flatMap((b) => opsOf(b)),
    ];
    expect({
      mounted: (h.game.module.ui as any)._mountedLayouts.has("hud"),
      created: ops.some((m) => m.method === "ui/create" && m.params?.name === "hud"),
    }).toEqual({ mounted: false, created: false });
  });
});

const SPRITE: File = {
  uri: "inmemory:///sprite.png",
  type: "image",
  name: "SPRITE",
  ext: "png",
  src: "/file:/proj/sprite.png?v=1",
} as File;

describe("composition, round 1 of PR #1865", () => {
  test("a mount an abandoned display left waiting does not hold a newer display back", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.jumpToFlow("start");
    const before = h.game.save() as string;
    const beat = h.nextBeat();
    const coordinator = new Coordinator(h.game, beat!);
    for (let i = 0; i < 10; i += 1) {
      await flushMicrotasks(20);
      coordinator.onUpdate(tick());
    }
    h.game.load(before);
    h.game.context.system.previewing = true;
    void h.reconnect();
    await flushMicrotasks(40);
    const mark = h.messages.length;

    h.game.module.ui.sweepReconcile();
    await flushMicrotasks(40);

    expect(beats(h.messages.slice(mark)).filter((b) => b.sweep)).toHaveLength(1);
  });

  test("a played beat that starts while the last one waits on what it realizes gets a beat of its own, and takes that work over", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    let finish!: () => void;
    const unfinished = new Promise<void>((resolve) => {
      finish = resolve;
    });
    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "First" }], true);
    ui.composeWait(unfinished);
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    expect(beats(h.messages)).toEqual([]);

    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "Second" }], true);
    void ui.endCompose({ time: 200 });
    await flushMicrotasks(20);
    expect(beats(h.messages).map((b: any) => b.time)).toEqual([100]);

    finish();
    await flushMicrotasks(20);
    const sent = beats(h.messages);
    expect(sent.map((b: any) => b.time)).toEqual([100, 200]);
    const texts = sent.map((b: any) =>
      writesOf(b, "dialogue").flatMap((w: any) => w.instructions.map((i: any) => i.text)),
    );
    expect(texts).toEqual([["First"], ["Second"]]);
  });

  test("a played beat's pictures are let go only once its beat has gone to the page", async () => {
    const h = createHarness(
      `define SPRITE as image with\n  src = "${SPRITE.src}"\nend\n\n${STORY.replace("  HERO: The first line.", "  HERO:\n    [[show portrait SPRITE]]\n    The first line.")}`,
      0,
      { assets: [SPRITE], beforeConnect: playing },
    );
    await h.ready;
    h.jumpToFlow("start");
    h.reset();

    await play(h);

    const beatAt = h.messages.findIndex((m) => m.method === "ui/beat");
    const releases = h.messages
      .map((m, i) => ({ m, i }))
      .filter(({ m }) => m.method === "assets/release" && (m.params?.pins ?? []).some((p: string) => p.startsWith("beat:")));
    expect(beatAt).toBeGreaterThan(-1);
    expect(releases.length).toBeGreaterThan(0);
    expect(releases.every(({ i }) => i > beatAt)).toBe(true);
  });

  test("a beat that waits on nothing leaves no subscription behind", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.jumpToFlow("start");
    h.reset();
    await play(h);
    await play(h);

    expect(beats(h.messages).filter((b: any) => b.time != null)).toHaveLength(2);
    const ui: any = h.game.module.ui;
    expect(ui._realizationChange).toBeUndefined();
  });
});

describe("composition, round 2 of PR #1865", () => {
  const hudCreated = (ops: any[]) =>
    ops.some((m) => m.method === "ui/create" && m.params?.name === "hud");

  test("a mount the last beat still waits for goes up with the next beat, which waits for it", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.openLayout("hud"));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "Second" }], true);
    void ui.endCompose({ time: 200 });
    await flushMicrotasks(20);
    expect(beats(h.messages).map((b: any) => b.time)).toEqual([100]);

    await releaseFonts(h);

    const sent = beats(h.messages);
    expect(sent.map((b: any) => b.time)).toEqual([100, 200]);
    expect(hudCreated(opsOf(sent[1]))).toBe(true);
    expect(hudCreated(screenOps(h.messages))).toBe(false);
  });

  test("a close in the next beat calls off a mount still waiting on its font", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.openLayout("hud"));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud"));
    void ui.endCompose({ time: 200 });

    await releaseFonts(h);

    const everything = [
      ...screenOps(h.messages),
      ...beats(h.messages).flatMap((b: any) => opsOf(b)),
    ];
    expect(hudCreated(everything)).toBe(false);
  });

  test("a closing layout's exit transition does not hold the beat; its element goes once the page reports the transition played", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud", undefined, true);
    await flushMicrotasks(20);
    const hudId = ui._mountedLayouts.get("hud").element.id;
    h.reset();

    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud", { with: "fade", over: 0.5 }));
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    void ui.text.write("dialogue", [{ text: "Next" }], true);
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);

    const [beat, ...more] = beats(h.messages);
    expect(more).toEqual([]);
    const exit = opsOf(beat).find(
      (m: any) => m.method === "ui/animate" && m.params.effects[0]?.element === hudId,
    );
    expect(exit).toBeTruthy();
    const destroyed = () =>
      flattenMessages(h.messages)
        .concat(beats(h.messages).flatMap((b: any) => opsOf(b)))
        .some((m: any) => m.method === "ui/destroy" && m.params.element === hudId);
    expect(destroyed()).toBe(false);

    h.game.connection.receive({
      jsonrpc: "2.0",
      id: exit.id,
      method: exit.method,
      result: [0],
    } as any);
    await flushMicrotasks(20);
    expect(destroyed()).toBe(true);
    const batch = h.messages.find(
      (m: any) =>
        m.method === "ui/batch" &&
        m.params.messages.some((op: any) => op.method === "ui/destroy" && op.params.element === hudId),
    );
    expect(batch.params.messages.every((op: any) => op.params.retired === true)).toBe(true);
  });
});

describe("the retirement path, round 3 of PR #1865", () => {
  async function hudShown(opts: { holdAssets?: boolean } = {}) {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      autoOpenAll: false,
      beforeConnect: playing,
      ...opts,
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud", undefined, true);
    await flushMicrotasks(20);
    return { h, ui, hudId: ui._mountedLayouts.get("hud").element.id as string };
  }

  const exitOf = (h: ReturnType<typeof createHarness>, id: string) =>
    beats(h.messages)
      .flatMap((b: any) => opsOf(b))
      .find((m: any) => m.method === "ui/animate" && m.params.effects[0]?.element === id);

  const answer = (h: ReturnType<typeof createHarness>, msg: any, reply: object) =>
    h.game.connection.receive({ jsonrpc: "2.0", id: msg.id, method: msg.method, ...reply } as any);

  const everything = (h: ReturnType<typeof createHarness>) => [
    ...screenOps(h.messages),
    ...beats(h.messages).flatMap((b: any) => opsOf(b)),
  ];

  test("an exit that finishes after a connect leaves the screen that connect built alone", async () => {
    const { h, ui, hudId } = await hudShown();
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud", { with: "fade", over: 0.5 }));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    const exit = exitOf(h, hudId);
    expect(exit).toBeTruthy();

    await h.reconnect();
    await flushMicrotasks(20);
    await ui.openLayout("hud", undefined, true);
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.get("hud").element.id).toBe(hudId);
    h.reset();

    answer(h, exit, { result: [0] });
    await flushMicrotasks(20);
    expect(everything(h).some((m: any) => m.method === "ui/destroy" && m.params.element === hudId)).toBe(false);
  });

  test("a layout closed and reopened in one beat keeps its fonts pinned once the old element has gone", async () => {
    const { h, ui, hudId } = await hudShown();
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud", { with: "fade", over: 0.5 }));
    ui.composeWait(ui.openLayout("hud"));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(30);
    expect(ui._mountedLayouts.has("hud")).toBe(true);

    answer(h, exitOf(h, hudId), { result: [0] });
    await flushMicrotasks(20);

    const at = (pred: (m: any) => boolean) => h.messages.map((m, i) => (pred(m) ? i : -1)).filter((i) => i >= 0);
    const pinned = at((m) => m.method === "assets/load" && m.params?.pin === "layout:hud");
    const released = at((m) => m.method === "assets/release" && m.params?.pins?.includes("layout:hud"));
    expect(pinned.length).toBeGreaterThan(0);
    expect(Math.max(...pinned)).toBeGreaterThan(Math.max(-1, ...released));
    expect(
      h.messages.some(
        (m: any) =>
          m.method === "assets/release" &&
          m.params?.pins?.some((p: string) => p.startsWith("layout:hud:retiring:")),
      ),
    ).toBe(true);
  });

  test("a close calls off every open of the layout still waiting on its font", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    for (const [time, step] of [
      [100, () => ui.composeWait(ui.openLayout("hud"))],
      [200, () => ui.composeWait(ui.openLayout("hud"))],
      [300, () => ui.composeWait(ui.closeLayout("hud"))],
    ] as const) {
      expect(ui.beginCompose()).toBe(true);
      step();
      void ui.endCompose({ time });
      await flushMicrotasks(20);
    }

    await releaseFonts(h);

    expect(everything(h).some((m: any) => m.method === "ui/create" && m.params?.name === "hud")).toBe(false);
    expect(ui._mountedLayouts.has("hud")).toBe(false);
  });

  test("a composition a connect drops lets go of the animations it carried", async () => {
    const { h, ui, hudId } = await hudShown();
    expect(ui.beginCompose()).toBe(true);
    let closed = false;
    void ui.closeLayout("hud", { with: "fade", over: 0.5 }).then(() => (closed = true));
    ui.composeWait(new Promise(() => {}));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    const exit = ui._compose.messages
      .flatMap((m: any) => flattenMessages([m]))
      .find((m: any) => m.method === "ui/animate" && m.params.effects[0]?.element === hudId);
    expect(exit).toBeTruthy();
    expect(closed).toBe(true);

    await h.reconnect();
    await flushMicrotasks(20);

    const connection: any = h.game.connection;
    expect(exit.id in connection._outgoingRequestRejectCallbacks).toBe(false);
    expect(exit.id in connection._outgoingRequestResolveCallbacks).toBe(false);
  });

  test("a captured animation the page fails is reported, as one sent on its own is", async () => {
    const { h, ui, hudId } = await hudShown();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(ui.beginCompose()).toBe(true);
      ui.composeWait(ui.closeLayout("hud", { with: "fade", over: 0.5 }));
      void ui.endCompose({ time: 100 });
      await flushMicrotasks(20);

      answer(h, exitOf(h, hudId), {
        error: { code: -32601, message: "nothing on the page handles ui/animate" },
      });
      await flushMicrotasks(20);

      expect(warn).toHaveBeenCalledWith(expect.stringContaining("ui/animate failed"));
    } finally {
      warn.mockRestore();
    }
  });
});

describe("the retirement path, round 4 of PR #1865", () => {
  test("an open a close calls off lets go of the layout's fonts", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      holdAssets: true,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.openLayout("hud"));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud"));
    void ui.endCompose({ time: 200 });

    await releaseFonts(h);

    expect(ui._mountedLayouts.has("hud")).toBe(false);
    const assets: any = h.game.module.assets;
    expect(assets._layoutPins.has("hud")).toBe(false);
    const pinned = h.messages.findIndex((m: any) => m.method === "assets/load" && m.params?.pin === "layout:hud");
    const released = h.messages.findIndex(
      (m: any) => m.method === "assets/release" && m.params?.pins?.includes("layout:hud"),
    );
    expect(pinned).toBeGreaterThan(-1);
    expect(released).toBeGreaterThan(pinned);
  });
});

describe("round 5 of PR #1865", () => {
  test("a retired layout goes when its exit has played, past a beat still being composed, and its fonts' pin after it", async () => {
    const h = createHarness(hudStory("[[open hud]]"), 0, {
      assets: FONTS,
      autoOpenAll: false,
      beforeConnect: playing,
    });
    await h.ready;
    const ui: any = h.game.module.ui;
    await ui.openLayout("hud", undefined, true);
    await flushMicrotasks(20);
    const hudId = ui._mountedLayouts.get("hud").element.id;
    h.reset();
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(ui.closeLayout("hud", { with: "fade", over: 0.5 }));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);
    const exit = beats(h.messages)
      .flatMap((b: any) => opsOf(b))
      .find((m: any) => m.method === "ui/animate" && m.params.effects[0]?.element === hudId);
    expect(exit).toBeTruthy();
    expect(ui.beginCompose()).toBe(true);
    void ui.text.write("dialogue", [{ text: "B" }], true);
    ui.composeWait(new Promise(() => {}));
    void ui.endCompose({ time: 200 });
    await flushMicrotasks(20);

    h.game.connection.receive({ jsonrpc: "2.0", id: exit.id, method: exit.method, result: [0] } as any);
    await flushMicrotasks(20);

    const at = h.messages.findIndex(
      (m: any) =>
        m.method === "ui/batch" &&
        m.params.messages.some((op: any) => op.method === "ui/destroy" && op.params.element === hudId),
    );
    expect(at).toBeGreaterThan(-1);
    expect(
      ui._compose.messages
        .flatMap((m: any) => flattenMessages([m]))
        .some((m: any) => m.method === "ui/destroy" && m.params.element === hudId),
    ).toBe(false);
    const released = h.messages.findIndex(
      (m: any) =>
        m.method === "assets/release" &&
        m.params?.pins?.some((p: string) => p.startsWith("layout:hud:retiring:")),
    );
    expect(released).toBeGreaterThan(at);
  });

  test("a beat's screen change that fails is reported, and the beat still goes", async () => {
    const h = createHarness(STORY, 0, { beforeConnect: playing });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    const errors: string[] = [];
    h.game.story.onError = ((message: string) => errors.push(message)) as any;
    expect(ui.beginCompose()).toBe(true);
    ui.composeWait(Promise.reject(new Error("could not mount")));
    void ui.endCompose({ time: 100 });
    await flushMicrotasks(20);

    expect(errors.some((e) => e.includes("could not mount"))).toBe(true);
    expect(beats(h.messages).map((b: any) => b.time)).toEqual([100]);
  });
});
