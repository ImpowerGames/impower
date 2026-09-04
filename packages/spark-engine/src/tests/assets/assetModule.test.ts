import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, it } from "vitest";
import { Clock } from "../../game/core/classes/Clock";
import { Coordinator } from "../../game/core/classes/Coordinator";
import { Game } from "../../game/core/classes/Game";
import { type Instructions } from "../../game/core/types/Instructions";
import { createHarness, flushMicrotasks } from "../ui/harness/uiTestHarness";

// The asset module through the real engine: what it asks the page for, when it
// waits, and what it lets go of (docs/engine/asset-preloading-spec.md).

const asset = (type: string, name: string, ext: string): File => ({
  uri: `file://proj/${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("image", "room", "png"),
  asset("image", "room2", "png"),
  asset("image", "room3", "png"),
  asset("image", "bunny", "png"),
  asset("image", "hat", "png"),
  asset("audio", "theme", "mp3"),
  asset("font", "Fancy", "ttf"),
];

const STORY = `scene A
  [[show backdrop room]]
  ((play music theme))
  Line one.
  [[show portrait bunny]]
  Line two.
  [[show portrait hat]]
  -> B
end

scene B
  [[show backdrop room2]]
  Line three.
  done
end

scene C
  [[show backdrop room3]]
  Line four.
  done
end
`;

const tick = (deltaMS = 0) => ({ deltaMS }) as Clock;

const byMethod = (messages: any[], method: string) =>
  messages.filter((m) => m?.method === method);

const itemKeys = (msg: any): string[] =>
  (msg?.params?.items ?? []).map((item: any) =>
    item.kind === "audio" ? item.params.key : item.src,
  );

/** A game that is about to play rather than preview. */
const playing = (game: Game) => {
  game.context.system.previewing = undefined;
};

describe("AssetModule", () => {
  it("configures the page's cache at connect from `config.assets`", async () => {
    const h = createHarness(STORY, 0, { assets: ASSETS });
    await h.ready;
    const configure = byMethod(h.messages, "assets/configure");
    expect(configure).toHaveLength(1);
    expect(configure[0].params).toEqual({ cacheBytes: 300 * 1024 * 1024 });

    const small = createHarness(
      `define assets as config with\n  asset_cache_size = 1\nend\n\n${STORY}`,
      0,
      { assets: ASSETS },
    );
    await small.ready;
    expect(byMethod(small.messages, "assets/configure")[0].params).toEqual({
      cacheBytes: 1024 * 1024,
    });
  });

  it("prefetches a scene's visuals, and only its visuals, when previewing it", async () => {
    const h = createHarness(STORY, 1, { assets: ASSETS });
    await h.ready;
    h.reset();
    h.game.observeScene("A.0");
    const prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches).toHaveLength(1);
    expect(prefetches[0].params.priority).toBe(2);
    const keys = itemKeys(prefetches[0]);
    expect(keys).toContain("/file:/proj/room.png?v=1");
    expect(keys).toContain("/file:/proj/bunny.png?v=1");
    expect(keys).toContain("/file:/proj/hat.png?v=1");
    expect(keys.some((k) => k.startsWith("audio."))).toBe(false);
  });

  it("predicts a bounded window ahead in play, spilling into the next scene", async () => {
    const h = createHarness(
      `define assets as config with\n  predict_distance = 3\nend\n\n${STORY}`,
      0,
      { assets: ASSETS, beforeConnect: playing },
    );
    await h.ready;
    h.reset();
    const beats = h.game.program.sceneAssets!["A"]!.beats;
    expect(beats.length).toBe(4);
    // From the first beat, inclusive: room, theme, bunny fit the window.
    h.game.observeScene(beats[0]!.path);
    let prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches).toHaveLength(1);
    expect(itemKeys(prefetches[0])).toEqual([
      "/file:/proj/room.png?v=1",
      "/file:/proj/bunny.png?v=1",
      "audio.theme",
    ]);
    // Past the last beat of A the window runs into B (the successor) at the
    // spill priority, and never resends what it already asked for.
    h.reset();
    (h.game.module.assets as any).predictFrom("A", beats[2]!.path, true);
    prefetches = byMethod(h.messages, "assets/prefetch");
    expect(prefetches.map((m) => m.params.priority)).toEqual([2, 3]);
    expect(itemKeys(prefetches[0])).toEqual(["/file:/proj/hat.png?v=1"]);
    expect(itemKeys(prefetches[1])).toEqual(["/file:/proj/room2.png?v=1"]);
  });

  it("makes a line wait for its images, then releases the line's pin", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      beforeConnect: playing,
      holdAssets: true,
    });
    await h.ready;
    h.reset();
    const instructions: Instructions = {
      text: { dialogue: [{ control: "show", text: "Hello" }] },
      image: { portrait: [{ control: "show", assets: ["bunny"] }] },
      end: 0,
    };
    const coordinator = new Coordinator(h.game, instructions);
    await flushMicrotasks();
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params.priority).toBe(0);
    expect(load[0].params.pin).toMatch(/^beat:\d+$/);
    expect(itemKeys(load[0])).toEqual(["/file:/proj/bunny.png?v=1"]);
    // Nothing is written while the page is still loading.
    coordinator.onUpdate(tick());
    expect(byMethod(h.messages, "ui/write-image")).toHaveLength(0);
    expect(byMethod(h.messages, "ui/write-text")).toHaveLength(0);
    h.releaseAssets();
    await flushMicrotasks();
    coordinator.onUpdate(tick());
    expect(byMethod(h.messages, "ui/write-image").length).toBeGreaterThan(0);
    expect(byMethod(h.messages, "ui/write-text").length).toBeGreaterThan(0);
    const release = byMethod(h.messages, "assets/release");
    expect(release.at(-1)?.params).toEqual({
      pins: [load[0].params.pin],
      drop: false,
    });
  });

  it("displays anyway, with a warning, when the page never answers", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      beforeConnect: playing,
      holdAssets: true,
    });
    await h.ready;
    h.reset();
    const warnings: string[] = [];
    const realWarn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      const coordinator = new Coordinator(h.game, {
        image: { portrait: [{ control: "show", assets: ["bunny"] }] },
        end: 0,
      });
      await flushMicrotasks();
      coordinator.onUpdate(tick());
      expect(byMethod(h.messages, "ui/write-image")).toHaveLength(0);
      h.flushTimers();
      await flushMicrotasks();
      coordinator.onUpdate(tick());
      expect(byMethod(h.messages, "ui/write-image").length).toBeGreaterThan(0);
      expect(warnings.some((w) => w.includes("timed out"))).toBe(true);
    } finally {
      console.warn = realWarn;
    }
  });

  it("runs a load beat behind the loading layout and advances when done", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      beforeConnect: playing,
      holdAssets: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    const coordinator = new Coordinator(h.game, {
      load: [{ name: "B" }],
      end: 0,
    });
    await flushMicrotasks();
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params).toMatchObject({ priority: 1, pin: "load:B" });
    expect(itemKeys(load[0])).toEqual(["/file:/proj/room2.png?v=1"]);
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    coordinator.onUpdate(tick());
    expect(coordinator.shouldContinue()).toBe(0);
    // Progress reaches the layout root as a custom property.
    h.game.connection.receive({
      jsonrpc: "2.0",
      method: "assets/progress",
      params: { pin: "load:B", loaded: 1, failed: 0, total: 2 },
    } as any);
    // UI updates are batched and flushed on a microtask.
    await flushMicrotasks();
    const progressWrites = h
      .snapshotFiltered("ui/update")
      .filter((m: any) => m.params?.style?.["--loading_progress"] != null);
    expect(progressWrites.length).toBe(1);
    expect((progressWrites[0] as any).params.style["--loading_progress"]).toBe(
      "0.5",
    );
    // The page answers; the layout stays for its minimum display time, then
    // closes and the beat advances by itself.
    h.releaseAssets();
    await flushMicrotasks(20);
    coordinator.onUpdate(tick());
    expect(ui._mountedLayouts.has("loading")).toBe(true);
    expect(coordinator.shouldContinue()).toBe(0);
    h.flushTimers();
    await flushMicrotasks(20);
    expect(ui._mountedLayouts.has("loading")).toBe(false);
    coordinator.onUpdate(tick());
    expect(coordinator.shouldContinue()).toBe(1);
  });

  it("drops a scene's loaded set when a plain divert leaves it, but not while it is on the stack", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      beforeConnect: playing,
    });
    await h.ready;
    h.reset();
    const assets = h.game.module.assets;
    assets.runLoad([{ name: "A" }]);
    await flushMicrotasks(20);
    h.flushTimers();
    await flushMicrotasks(20);
    expect(byMethod(h.messages, "assets/load")[0]?.params.pin).toBe("load:A");
    h.reset();
    // A tunnel or thread into B keeps A on the callstack: nothing is dropped.
    assets.onEnterScene("B", "A", ["A"]);
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
    // Returning to A, then diverting to C, drops A's set.
    assets.onEnterScene("A", "B", []);
    expect(byMethod(h.messages, "assets/release")).toHaveLength(0);
    assets.onEnterScene("C", "A", []);
    const release = byMethod(h.messages, "assets/release");
    expect(release).toHaveLength(1);
    expect(release[0].params).toEqual({ pins: ["load:A"], drop: true });
  });

  it("only prefetches a load's visuals in preview, with no layout and no wait", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      autoOpenAll: false,
    });
    await h.ready;
    h.reset();
    const id = h.game.module.assets.runLoad([{ name: "B" }]);
    expect(h.game.module.assets.isReady(id)).toBe(true);
    expect(byMethod(h.messages, "assets/load")).toHaveLength(0);
    const prefetch = byMethod(h.messages, "assets/prefetch");
    expect(prefetch).toHaveLength(1);
    expect(itemKeys(prefetch[0])).toEqual(["/file:/proj/room2.png?v=1"]);
    expect((h.game.module.ui as any)._mountedLayouts.has("loading")).toBe(false);
  });

  it("mounts a layout only once its fonts are resident, and releases them when it closes", async () => {
    const source = `style hud with
  font_family = "Fancy"
end

layout hud with
  text "Score"
end

scene A
  Hello.
  [[open hud]]
  [[close hud]]
end
`;
    const h = createHarness(source, 0, {
      assets: ASSETS,
      beforeConnect: playing,
      holdAssets: true,
      autoOpenAll: false,
    });
    await h.ready;
    h.reset();
    const ui: any = h.game.module.ui;
    expect(h.game.module.ui.getFontNamesForLayout("hud")).toEqual(["Fancy"]);
    expect(h.game.module.ui.getFontNamesForLayout("main")).toEqual([]);
    const opening = ui.openLayout("hud");
    await flushMicrotasks();
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params.pin).toBe("layout:hud");
    expect(load[0].params.items[0]).toMatchObject({
      kind: "font",
      family: "Fancy",
      src: "/file:/proj/Fancy.ttf?v=1",
    });
    expect(ui._mountedLayouts.has("hud")).toBe(false);
    h.releaseAssets();
    await opening;
    expect(ui._mountedLayouts.has("hud")).toBe(true);
    h.reset();
    await ui.closeLayout("hud", undefined, true);
    expect(byMethod(h.messages, "assets/release")[0]?.params).toEqual({
      pins: ["layout:hud"],
      drop: false,
    });
  });

  it("holds a restore until the checkpoint's images are resident", async () => {
    const recorder = createHarness(STORY, 0, { assets: ASSETS });
    await recorder.ready;
    await recorder.display(
      { image: { backdrop: [{ control: "show", assets: ["room"] }] }, end: 0 },
      true,
    );
    const checkpoint = recorder.game.save();

    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      loadCheckpoint: checkpoint,
      holdAssets: true,
    });
    await flushMicrotasks(20);
    const load = byMethod(h.messages, "assets/load");
    expect(load).toHaveLength(1);
    expect(load[0].params.pin).toBe("restore");
    expect(itemKeys(load[0])).toEqual(["/file:/proj/room.png?v=1"]);
    // Connect clears the transient layers (empty image writes); the backdrop
    // itself must not be written until the page has it.
    const roomWrites = () =>
      byMethod(h.messages, "ui/write-image").filter((m) =>
        JSON.stringify(m.params).includes("room.png"),
      );
    expect(roomWrites()).toHaveLength(0);
    h.releaseAssets();
    await h.ready;
    expect(roomWrites().length).toBeGreaterThan(0);
    expect(byMethod(h.messages, "assets/release").at(-1)?.params).toEqual({
      pins: ["restore"],
      drop: false,
    });
  });

  it("unpins everything without dropping it when the game is destroyed", async () => {
    const h = createHarness(STORY, 0, {
      assets: ASSETS,
      beforeConnect: playing,
    });
    await h.ready;
    h.game.module.assets.runLoad([{ name: "A" }]);
    await flushMicrotasks(20);
    h.flushTimers();
    await flushMicrotasks(20);
    h.reset();
    h.game.destroy();
    const release = byMethod(h.messages, "assets/release");
    expect(release).toHaveLength(1);
    expect(release[0].params.drop).toBe(false);
    expect(release[0].params.pins).toContain("load:A");
  });

  it("emits nothing while a route is being simulated", async () => {
    const h = createHarness(STORY, 0, { assets: ASSETS, connect: false });
    h.game.context.system.simulating = "A";
    h.game.observeScene("A.0");
    expect(h.game.module.assets.prepareBeat({ image: { portrait: [{ control: "show", assets: ["bunny"] }] }, end: 0 })).toBeNull();
    const id = h.game.module.assets.runLoad([{ name: "B" }]);
    expect(h.game.module.assets.isReady(id)).toBe(true);
    expect(h.messages.filter((m) => m?.method?.startsWith("assets/"))).toHaveLength(0);
  });
});
