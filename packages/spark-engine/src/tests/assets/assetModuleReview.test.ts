// Behaviour the adversarial review found untested or wrong: a load with
// nothing to fetch still shows its screen; a beat's pin lasts until the beat
// is written; destroy cancels gates and releases what it held; a timeout of 0
// means none and the configured one is the one used; names parsed at runtime
// are noticed; the caller of a real tunnel stays pinned; a silent game emits
// nothing; the font heuristic sees child classes, component bodies, and
// inline props; the loading layout never mounts after its load ended.

import "@impower/sparkdown/src/inkjs/engine/Container";
import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it, vi } from "vitest";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

const ASSETS: File[] = [
  { uri: "file://proj/room.png", type: "image", name: "room", ext: "png", src: "/file:/proj/room.png?v=1" },
  { uri: "file://proj/room2.png", type: "image", name: "room2", ext: "png", src: "/file:/proj/room2.png?v=1" },
  { uri: "file://proj/fancy.ttf", type: "font", name: "Fancy", ext: "ttf", src: "/file:/proj/fancy.ttf?v=1" },
];

const byMethod = (messages: any[], method: string) =>
  messages.filter((m) => m?.method === method);
const itemKeys = (m: any): string[] =>
  (m?.params?.items ?? []).map((i: any) => i.src ?? i.params?.key);
const playing = (game: any) => {
  game.context.system.previewing = undefined;
};
const tick = (deltaMS = 16) => ({ deltaMS }) as any;

describe("AssetModule, after review", () => {
  it("shows the loading layout for a load with nothing left to fetch", async () => {
    const h = createHarness(
      `define assets as config with\n  loading_min = 1\nend\n\nscene A\n  Hi.\n  -> load B\nend\n\nscene B\n  Nothing to load here.\nend\n`,
      0,
      { assets: ASSETS, beforeConnect: playing },
    );
    await h.ready;
    const ui: any = h.game.module.ui;
    const coordinator = new Coordinator(h.game, { load: [{ name: "B" }], end: 0 });
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    coordinator.onUpdate(tick());
    expect(coordinator.shouldContinue()).toBe(0);
    // The minimum display, then the beat advances by itself.
    expect(h.timerDelays()).toContain(1000);
    h.flushTimers();
    await flushMicrotasks(20);
    coordinator.onUpdate(tick());
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    expect(coordinator.shouldContinue()).toBe(1);
  });

  it("keeps a beat's pin until the beat is written, then releases it", async () => {
    const h = createHarness(`scene A\n  [[show backdrop room]]\n  Hi.\nend\n`, 0, {
      assets: ASSETS,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const assets: any = h.game.module.assets;
    const id = assets.prepareBeat({ image: { backdrop: [{ control: "show", assets: ["room"] }] }, end: 0 });
    await flushMicrotasks();
    expect(assets.isReady(id)).toBe(true);
    assets.trigger(id);
    // The gate opened; nothing is released yet.
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
    assets.onBeatDisplayed();
    expect(byMethod(h.messages, "assets/release").map((m) => m.params)).toEqual([
      { pins: [`beat:${id}`], drop: false },
    ]);
  });

  it("arms the configured timeout, and none when it is 0", async () => {
    const three = createHarness(
      `define assets as config with\n  beat_timeout = 3\nend\n\nscene A\n  Hi.\nend\n`,
      0,
      { assets: ASSETS, beforeConnect: playing, holdAssets: true },
    );
    await three.ready;
    (three.game.module.assets as any).prepareBeat({
      image: { backdrop: [{ control: "show", assets: ["room"] }] },
      end: 0,
    });
    expect(three.timerDelays()).toContain(3000);

    const none = createHarness(
      `define assets as config with\n  beat_timeout = 0\nend\n\nscene A\n  Hi.\nend\n`,
      0,
      { assets: ASSETS, beforeConnect: playing, holdAssets: true },
    );
    await none.ready;
    none.reset();
    (none.game.module.assets as any).prepareBeat({
      image: { backdrop: [{ control: "show", assets: ["room"] }] },
      end: 0,
    });
    expect(none.timerDelays()).toEqual([]);
  });

  it("neither warns nor touches the page after the game is destroyed", async () => {
    const h = createHarness(`scene A\n  Hi.\nend\n`, 0, {
      assets: ASSETS,
      beforeConnect: playing,
      holdAssets: true,
    });
    await h.ready;
    const assets: any = h.game.module.assets;
    const id = assets.prepareBeat({ image: { backdrop: [{ control: "show", assets: ["room"] }] }, end: 0 });
    expect(id).not.toBeNull();
    h.reset();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      h.game.destroy();
      // Destroy released the beat's pin itself.
      const releases = byMethod(h.messages, "assets/release").map((m) => m.params.pins).flat();
      expect(releases).toContain(`beat:${id}`);
      h.flushTimers();
      expect(warn).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it("notices a name the interpreter parses at runtime before the line's gate", async () => {
    const h = createHarness(`scene A\n  Hi.\nend\n`, 0, { assets: ASSETS, beforeConnect: playing });
    await h.ready;
    h.reset();
    h.game.module.interpreter.parse("[[show backdrop room2]] Hello", "main", {} as any);
    const prefetch = byMethod(h.messages, "assets/prefetch");
    expect(prefetch).toHaveLength(1);
    expect(itemKeys(prefetch[0])).toEqual(["/file:/proj/room2.png?v=1"]);
  });

  it("keeps a caller's loaded set pinned through a real tunnel, and drops it on a real divert", async () => {
    const h = createHarness(
      `scene Start\n  -> load A\nend\n\nscene A\n  [[show backdrop room]]\n  In A.\n  -> load B ->\n  Back in A.\n  -> load C\nend\n\nscene B\n  [[show backdrop room2]]\n  In B.\n  ->->\nend\n\nscene C\n  [[show backdrop room]]\n  In C.\nend\n`,
      0,
      { assets: ASSETS, beforeConnect: playing },
    );
    await h.ready;
    h.jumpTo("Start");
    h.reset();
    const assets: any = h.game.module.assets;
    const releasesSoFar = () =>
      byMethod(h.messages, "assets/release")
        .filter((m) => m.params.drop)
        .map((m) => m.params.pins)
        .flat();
    // The harness steps the story directly, so the game's own path watcher
    // and the load beats are invoked by hand after each beat; the call stack
    // the watcher reads is the real one the story keeps for the tunnel.
    const stepUntil = (text: string) => {
      for (let i = 0; i < 12; i++) {
        const beat = h.nextBeat();
        if (beat?.load) {
          assets.runLoad(beat.load);
        }
        h.game.observeScene(
          (h.game.story.state as any).previousPointer?.path?.toString(),
        );
        const line = Object.values(beat?.text ?? {})
          .flat()
          .map((t: any) => t.text)
          .join("");
        if (line.includes(text)) {
          return;
        }
      }
      throw new Error(`never reached "${text}"`);
    };
    stepUntil("In B.");
    expect(h.game.sceneTracker.current).toBe("B");
    // Inside the tunnel, A is on the call stack: nothing was dropped.
    expect(releasesSoFar()).toEqual([]);
    stepUntil("Back in A.");
    // Returning drops B's set; A's survives.
    expect(releasesSoFar()).toEqual(["load:B"]);
    stepUntil("In C.");
    expect(releasesSoFar()).toEqual(["load:B", "load:A"]);
  });

  it("emits nothing while the game simulates, on every path", async () => {
    const h = createHarness(`scene A\n  [[show backdrop room]]\n  Hi.\nend\n`, 0, {
      assets: ASSETS,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const emitted: string[] = [];
    const emit = vi
      .spyOn(h.game.connection, "emit")
      .mockImplementation(((msg: any) => {
        emitted.push(msg?.method);
        return Promise.resolve(undefined);
      }) as any);
    try {
      (h.game as any)._simulation = "simulating";
      const assets: any = h.game.module.assets;
      expect(assets.prepareBeat({ image: { backdrop: [{ control: "show", assets: ["room"] }] }, end: 0 })).toBeNull();
      assets.notice("image", ["room"]);
      assets.onEnterScene("A", null, []);
      assets.onBeatDisplayed();
      expect(assets.prepareLayout("main")).toBeUndefined();
      expect(emitted.filter((m) => m?.startsWith("assets/"))).toEqual([]);
    } finally {
      emit.mockRestore();
    }
  });

  it("finds a layout's fonts through child classes, component bodies, and inline props", async () => {
    const h = createHarness(
      [
        `style score_text with\n  font_family = "Fancy"\nend`,
        `style card_title with\n  font_family = "Fancy"\nend`,
        `component card with\n  card_title "Hi"\nend`,
        `layout hud with\n  score_text:\n    text "Score"\nend`,
        `layout deck with\n  card()\nend`,
        `layout badge with\n  text "Badge" #font_family="Fancy"\nend`,
        `scene A\n  Hi.\nend`,
      ].join("\n\n") + "\n",
      0,
      { assets: ASSETS, autoOpenAll: false },
    );
    await h.ready;
    const ui = h.game.module.ui;
    expect(ui.getFontNamesForLayout("hud")).toEqual(["Fancy"]);
    expect(ui.getFontNamesForLayout("deck")).toEqual(["Fancy"]);
    expect(ui.getFontNamesForLayout("badge")).toEqual(["Fancy"]);
  });

  it("never mounts the loading layout after its load ended during the font wait", async () => {
    const h = createHarness(
      `define assets as config with\n  loading_min = 0\nend\n\nstyle loading with\n  font_family = "Fancy"\nend\n\nscene A\n  Hi.\nend\n`,
      0,
      { assets: ASSETS, beforeConnect: playing, holdAssets: true, autoOpenAll: false },
    );
    await h.ready;
    const ui: any = h.game.module.ui;
    ui.beginLoading("fade", "B");
    await flushMicrotasks(20);
    // The fonts are still held, so the layout has not mounted yet.
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    const closing = ui.endLoading();
    await flushMicrotasks(20);
    h.releaseAssets();
    await flushMicrotasks(20);
    h.flushTimers();
    await closing;
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("loading")).toBe(false);
  });
});
