import { type File } from "@impower/sparkdown/src/compiler/types/File";
import { describe, expect, test } from "vitest";
import { uiBuiltinDefinitions } from "../../game/modules/ui/uiBuiltinDefinitions";
import { createHarness, flushMicrotasks } from "./harness/uiTestHarness";

const asset = (type: string, name: string, ext: string): File => ({
  uri: `inmemory:///${name}.${ext}`,
  type,
  name,
  ext,
  src: `/file:/proj/${name}.${ext}?v=1`,
});

const ASSETS: File[] = [
  asset("video", "intro", "webm"),
  asset("audio", "theme", "mp3"),
  asset("image", "room", "png"),
];

const story = (body: string, defines = "") =>
  `${defines}\n-> start\n\nscene start\n${body}\nend\n`;

const byMethod = (messages: any[], method: string) =>
  messages.filter((m) => m?.method === method);

const musicUpdates = (messages: any[], channel = "music") =>
  byMethod(messages, "audio/update").filter(
    (m) => m.params?.channel === channel,
  );

const musicRestored = (messages: any[]) =>
  byMethod(messages, "audio/load").length > 0 ||
  musicUpdates(messages).some((m) => m.params.updates.length > 0);

const playing = (game: any) => {
  game.context.system.previewing = undefined;
};

async function beatsOf(body: string) {
  const h = createHarness(story(body), 0, { assets: ASSETS });
  await h.ready;
  h.jumpToFlow("start");
  const beats = [];
  for (let beat = h.nextBeat(); beat; beat = h.nextBeat()) {
    beats.push(beat);
  }
  return beats;
}

describe("a cutscene: the interpreter", () => {
  test("`[[play intro loop mute with fade]]` is a cutscene instruction on a beat of its own", async () => {
    const beats = await beatsOf(
      `  Before. [[play intro loop mute with fade]]\n  After.`,
    );
    expect(beats).toHaveLength(3);
    expect(beats[0]?.text).toBeDefined();
    expect(beats[0]?.cutscene).toBeUndefined();
    expect(beats[1]?.cutscene).toEqual([
      { name: "intro", loop: true, mute: true, with: "fade" },
    ]);
    expect(beats[1]?.text).toBeUndefined();
    expect(beats[1]?.image).toBeUndefined();
    expect(beats[1]?.audio).toBeUndefined();
    expect(beats[2]?.text).toBeDefined();
    expect(beats[2]?.cutscene).toBeUndefined();
  });

  test("a bare `[[play intro]]` carries only its name", async () => {
    const beats = await beatsOf(`  [[play intro]]\n  After.`);
    expect(beats[0]?.cutscene).toEqual([{ name: "intro" }]);
  });

  test("a picture-only line after a cutscene does not fold into its beat", async () => {
    const beats = await beatsOf(
      `  [[play intro]]\n  [[show backdrop room]]\n  After.`,
    );
    expect(beats[0]?.cutscene).toEqual([{ name: "intro" }]);
    expect(beats[0]?.image).toBeUndefined();
    expect(beats[1]?.image?.["backdrop"]).toBeDefined();
    expect(beats[1]?.cutscene).toBeUndefined();
  });

  test("`((play …))` still plays audio", async () => {
    const beats = await beatsOf(
      `  ((play song))\n  One.\n  ((play music theme))\n  Two.`,
    );
    expect(beats[0]?.audio?.["song"]?.[0]).toMatchObject({ control: "play" });
    expect(beats[0]?.cutscene).toBeUndefined();
    expect(beats[1]?.audio?.["music"]?.[0]).toMatchObject({
      control: "play",
      assets: ["theme"],
    });
    expect(beats[1]?.cutscene).toBeUndefined();
  });
});

describe("a cutscene: the UI module", () => {
  async function harness(
    opts: { playing?: boolean; defines?: string; body?: string } = {},
  ) {
    const h = createHarness(
      story(opts.body ?? "  A line.", opts.defines ?? ""),
      0,
      {
        assets: ASSETS,
        beforeConnect: opts.playing ? playing : undefined,
      },
    );
    await h.ready;
    h.reset();
    return h;
  }

  test("asks the page to play the video, and its trigger fires once the page answers", async () => {
    const h = await harness({ playing: true });
    const ui = h.game.module.ui;
    const id = ui.runCutscene({
      name: "intro",
      loop: true,
      mute: true,
      with: "fade",
    });
    const requests = byMethod(h.messages, "ui/play-cutscene");
    expect(requests).toHaveLength(1);
    expect(requests[0].params).toEqual({
      src: "/file:/proj/intro.webm?v=1",
      loop: true,
      muted: true,
      mixer: "movie",
      mixerGain: 1,
      with: "fade",
      enter: expect.objectContaining({ $name: "fadein" }),
      exit: expect.objectContaining({ $name: "fadeout" }),
    });
    expect(ui.isReady(id)).toBe(false);
    await flushMicrotasks(10);
    expect(ui.isReady(id)).toBe(true);
  });

  test("a page that cannot play the video is reported, and the trigger still fires", async () => {
    const h = await harness({ playing: true });
    const connection = h.game.connection as any;
    const emit = connection.emit;
    connection.emit = (msg: any, ...rest: any[]) =>
      msg?.method === "ui/play-cutscene"
        ? Promise.reject({ code: -32603, message: "decoder unavailable" })
        : emit.call(connection, msg, ...rest);
    const warnings: string[] = [];
    const warn = console.warn;
    console.warn = (...args: unknown[]) => warnings.push(args.join(" "));
    try {
      const ui = h.game.module.ui;
      const id = ui.runCutscene({ name: "intro" });
      await flushMicrotasks();
      expect(ui.isReady(id)).toBe(true);
      expect(
        warnings.some((w) =>
          w.includes("ui/play-cutscene failed: decoder unavailable"),
        ),
      ).toBe(true);
    } finally {
      console.warn = warn;
      connection.emit = emit;
    }
  });

  test("a bare cutscene plays once, with its sound", async () => {
    const h = await harness({ playing: true });
    h.game.module.ui.runCutscene({ name: "intro" });
    expect(byMethod(h.messages, "ui/play-cutscene")[0]?.params).toEqual({
      src: "/file:/proj/intro.webm?v=1",
      loop: false,
      muted: false,
      mixer: "movie",
      mixerGain: 1,
    });
  });

  test("its sound goes through the mixer the `movie` channel names, at that mixer's gain", async () => {
    const h = await harness({
      playing: true,
      defines: `define film as mixer with\n  gain = 0.25\nend\n\ndefine movie as channel with\n  mixer = "film"\nend\n`,
    });
    h.game.module.ui.runCutscene({ name: "intro" });
    expect(byMethod(h.messages, "ui/play-cutscene")[0]?.params).toMatchObject({
      mixer: "film",
      mixerGain: 0.25,
    });
  });

  test("a preview's request carries the preview flag", async () => {
    const h = await harness();
    expect(h.game.context.system.previewing).toBeTruthy();
    h.game.module.ui.runCutscene({ name: "intro" });
    expect(byMethod(h.messages, "ui/play-cutscene")[0]?.params).toEqual({
      src: "/file:/proj/intro.webm?v=1",
      loop: false,
      muted: false,
      mixer: "movie",
      mixerGain: 1,
      preview: true,
    });
  });

  test("sends nothing while a route is simulated, and is ready at once", async () => {
    const h = await harness({ playing: true });
    h.game.context.system.simulating = "start";
    const ui = h.game.module.ui;
    const id = ui.runCutscene({ name: "intro" });
    expect(ui.isReady(id)).toBe(true);
    expect(byMethod(h.messages, "ui/play-cutscene")).toHaveLength(0);
    expect(h.messages.filter((m) => m?.method?.startsWith("audio/"))).toEqual(
      [],
    );
  });

  test("`skipCutscene` tells the page to end it", async () => {
    const h = await harness({ playing: true });
    h.game.module.ui.skipCutscene();
    const skips = byMethod(h.messages, "ui/skip-cutscene");
    expect(skips).toHaveLength(1);
    expect(skips[0].params).toEqual({});
  });

  async function withMusic(defines = "") {
    const h = await harness({
      playing: true,
      defines,
      body: "  ((play music theme loop))\n  Music.",
    });
    h.jumpToFlow("start");
    const beat = h.nextBeat();
    expect(beat?.audio?.["music"]).toBeDefined();
    await h.display(beat!, false);
    await flushMicrotasks();
    expect(
      musicUpdates(h.messages).some((m) =>
        m.params.updates.some((u: any) => u.control === "start"),
      ),
    ).toBe(true);
    h.reset();
    return h;
  }

  test("stops the music with a short fade, and the music stays stopped after the cutscene", async () => {
    const h = await withMusic();
    h.game.module.ui.runCutscene({ name: "intro" });
    await flushMicrotasks(10);
    const stops = musicUpdates(h.messages).flatMap((m) => m.params.updates);
    expect(stops.length).toBeGreaterThan(0);
    for (const update of stops) {
      expect(update.control).toBe("stop");
      expect(update.over).toBeGreaterThan(0);
    }
    expect(byMethod(h.messages, "ui/play-cutscene")).toHaveLength(1);
    expect(
      musicUpdates(h.messages)
        .flatMap((m) => m.params.updates)
        .some((u: any) => u.control === "start"),
    ).toBe(false);
    const restored = createHarness(story("  ((play music theme loop))\n  Music."), 0, {
      assets: ASSETS,
      loadCheckpoint: h.game.save(),
      beforeConnect: playing,
    });
    await restored.ready;
    expect(musicRestored(restored.messages)).toBe(false);
  });

  test("stops music a restore brought back", async () => {
    const h = await withMusic();
    const restored = createHarness(
      story("  ((play music theme loop))\n  Music."),
      0,
      { assets: ASSETS, loadCheckpoint: h.game.save(), beforeConnect: playing },
    );
    await restored.ready;
    expect(musicRestored(restored.messages)).toBe(true);
    restored.reset();
    restored.game.module.ui.runCutscene({ name: "intro" });
    await flushMicrotasks(10);
    const updates = musicUpdates(restored.messages).flatMap(
      (m) => m.params.updates,
    );
    expect(updates.some((u: any) => u.control === "stop")).toBe(true);
    const again = createHarness(story("  ((play music theme loop))\n  Music."), 0, {
      assets: ASSETS,
      loadCheckpoint: restored.game.save(),
      beforeConnect: playing,
    });
    await again.ready;
    expect(musicRestored(again.messages)).toBe(false);
  });

  test("keeps restored music stopped when a cutscene starts while it still loads", async () => {
    const h = await withMusic();
    let release!: () => void;
    const loaded = new Promise<void>((resolve) => (release = resolve));
    let loadRequested = false;
    const restored = createHarness(
      story("  ((play music theme loop))\n  Music."),
      0,
      {
        assets: ASSETS,
        loadCheckpoint: h.game.save(),
        beforeConnect: (game: any) => {
          playing(game);
          const connection = game.connection;
          const emit = connection.emit;
          connection.emit = (msg: any, ...rest: any[]) => {
            if (msg?.method !== "audio/load") {
              return emit.call(connection, msg, ...rest);
            }
            loadRequested = true;
            return loaded.then(() => emit.call(connection, msg, ...rest));
          };
        },
      },
    );
    for (let i = 0; i < 100 && !loadRequested; i += 1) {
      await flushMicrotasks();
    }
    expect(loadRequested).toBe(true);
    restored.game.module.ui.runCutscene({ name: "intro" });
    await flushMicrotasks(10);
    release();
    await restored.ready;
    await flushMicrotasks(10);
    const updates = musicUpdates(restored.messages).flatMap(
      (m) => m.params.updates,
    );
    expect(updates.some((u: any) => u.control === "stop")).toBe(true);
    expect(updates.some((u: any) => u.control === "start")).toBe(false);
  });

  test("records the music stop while a route is simulated", async () => {
    const h = await withMusic();
    h.game.context.system.simulating = "start";
    h.game.module.ui.runCutscene({ name: "intro" });
    h.game.context.system.simulating = undefined;
    const restored = createHarness(story("  ((play music theme loop))\n  Music."), 0, {
      assets: ASSETS,
      loadCheckpoint: h.game.save(),
      beforeConnect: playing,
    });
    await restored.ready;
    expect(musicRestored(restored.messages)).toBe(false);
  });

  test("leaves the music alone when `stop_music` is off", async () => {
    const h = await withMusic(
      "define movie as config with\n  stop_music = false\nend\n",
    );
    h.game.module.ui.runCutscene({ name: "intro" });
    await flushMicrotasks(10);
    expect(musicUpdates(h.messages)).toEqual([]);
    expect(byMethod(h.messages, "ui/play-cutscene")).toHaveLength(1);
    const restored = createHarness(
      story(
        "  ((play music theme loop))\n  Music.",
        "define movie as config with\n  stop_music = false\nend\n",
      ),
      0,
      { assets: ASSETS, loadCheckpoint: h.game.save(), beforeConnect: playing },
    );
    await restored.ready;
    expect(musicRestored(restored.messages)).toBe(true);
  });
});

describe("a cutscene: the builtins", () => {
  test("`movie` config turns `stop_music` on, and the prelude matches the engine's mirror", async () => {
    const h = createHarness(story("  A line."), 0, { assets: ASSETS });
    await h.ready;
    const runtime = (h.game.context as any)?.config?.movie;
    const mirror = uiBuiltinDefinitions().config.movie;
    expect(runtime?.stop_music).toBe(true);
    expect(runtime).toMatchObject(mirror);
    const runtimeKeys = Object.keys(runtime ?? {})
      .filter((k) => !k.startsWith("$"))
      .sort();
    expect(runtimeKeys).toEqual(Object.keys(mirror).sort());
  });

  test("`style cutscene` and `style cutscene_video` exist above the loading screen, and match the mirror", async () => {
    const h = createHarness(story("  A line."), 0, { assets: ASSETS });
    await h.ready;
    const styles = (h.game.context as any)?.style;
    const mirror = uiBuiltinDefinitions().style;
    for (const name of ["cutscene", "cutscene_video"] as const) {
      const runtime = styles?.[name];
      expect(runtime).toBeDefined();
      const authored = Object.fromEntries(
        Object.entries(mirror[name] ?? {}).filter(([k]) => !k.startsWith("$")),
      );
      expect(runtime).toMatchObject(authored);
    }
    expect(Number(styles.cutscene.z_index)).toBeGreaterThan(
      Number(styles.loading.z_index),
    );
    expect(styles.cutscene).toMatchObject({
      z_index: "2000",
      position: "absolute",
      inset: "0",
      background_color: "black",
      pointer_events: "auto",
    });
    expect(styles.cutscene_video).toMatchObject({
      object_fit: "contain",
      pointer_events: "auto",
    });
  });

  test("an author restyles the cutscene with `style cutscene with … end`", async () => {
    const h = createHarness(
      story(
        "  A line.",
        "style cutscene with\n  background_color = white\nend\n",
      ),
      0,
      { assets: ASSETS },
    );
    await h.ready;
    const cutscene = (h.game.context as any)?.style?.cutscene;
    expect(cutscene?.background_color).toBe("white");
    expect(cutscene?.z_index).toBe("2000");
  });
});
