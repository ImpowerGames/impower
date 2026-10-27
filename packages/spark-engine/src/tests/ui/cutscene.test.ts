// A `[[play NAME]]` cutscene in the engine (I-1382): the interpreter queues it
// as a beat of its own, the UI module asks the page to play it and stops the
// music, and the builtins carry the `movie` config and the `cutscene` styles.

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

/** The audio messages that stop or start sound on `channel`. */
const musicUpdates = (messages: any[], channel = "music") =>
  byMethod(messages, "audio/update").filter(
    (m) => m.params?.channel === channel,
  );

/** Whether a restore brought the music back: it loads the track again, or an
 *  update on the channel carries something to play. */
const musicRestored = (messages: any[]) =>
  byMethod(messages, "audio/load").length > 0 ||
  musicUpdates(messages).some((m) => m.params.updates.length > 0);

const playing = (game: any) => {
  game.context.system.previewing = undefined;
};

/** Every beat the story queues from its start, in order. */
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
      with: "fade",
    });
    expect(ui.isReady(id)).toBe(false);
    await flushMicrotasks();
    expect(ui.isReady(id)).toBe(true);
  });

  test("a bare cutscene plays once, with its sound", async () => {
    const h = await harness({ playing: true });
    h.game.module.ui.runCutscene({ name: "intro" });
    expect(byMethod(h.messages, "ui/play-cutscene")[0]?.params).toEqual({
      src: "/file:/proj/intro.webm?v=1",
      loop: false,
      muted: false,
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

  /** A played beat that starts `theme` looping on the music channel. */
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
    // The music really started, or a missing stop below proves nothing.
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
    // The cutscene has ended (the page answered): nothing starts the music
    // again, and a checkpoint taken now restores no music.
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
    // The control for the restores above: music still playing comes back.
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
