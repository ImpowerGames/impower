import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import type { WriteImageInstruction } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { createMorphHost, inlineMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { blinkScript, portrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { describe, expect, test, vi } from "vitest";
import { ConfigureAudioMixerMessage } from "@impower/spark-engine/src/game/modules/audio/classes/messages/ConfigureAudioMixerMessage";
import { Application } from "../../app/Application";
import AssetManager from "../../app/managers/AssetManager";
import AudioManager from "../../app/managers/AudioManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import UIManager from "../../app/managers/UIManager";
import {
  createDOMHarness,
  createStubApp,
  flushMicrotasks,
  installJSDOM,
  untilShown,
} from "./domTestHarness";
import { fakeAudioContext, stubMedia } from "./mediaStubs";

vi.setConfig({ testTimeout: 60_000 });

const WAVE = "/file:/proj/bunny_wave.webm?v=1";
const RAIN = "/file:/proj/rain.webm?v=1";

const SOURCE = `define bunny_wave as video with
  src = "${WAVE}"
end

define rain as video with
  src = "${RAIN}"
end



scene start
  [[show portrait bunny_wave]]
  Waving.
  [[show portrait bunny_wave once mute]]
  Waving once.
  [[show backdrop rain]]
  Raining.
  [[hide backdrop]]
  Dry.
end
`;

const lineOf = (text: string) =>
  SOURCE.split("\n").findIndex((l) => l.includes(text));

const appOf = (h: { ui: any }) => h.ui.app as any;

async function playing(opts: { resident?: boolean; source?: string } = {}) {
  const h = createDOMHarness(opts.source ?? SOURCE, 0, { compose: true });
  const media = stubMedia(h.overlay);
  await h.ready;
  h.game.module.ui.sweepReconcile();
  await flushMicrotasks(10);
  h.game.context.system.previewing = undefined;
  const cache = appOf(h).assetCache;
  if (opts.resident) {
    let n = 0;
    cache._deps.fetchBytes = async () => ({
      bytes: new ArrayBuffer(100),
      type: "video/webm",
    });
    cache._deps.createObjectURL = () => `blob:page/${++n}`;
  }
  h.jumpTo("start");
  return { h, media, cache };
}

async function playNext(h: Awaited<ReturnType<typeof playing>>["h"]) {
  const next = h.nextBeat();
  expect(next).toBeTruthy();
  const coordinator = new Coordinator(h.game, next!);
  for (let i = 0; i < 10; i += 1) {
    await flushMicrotasks();
    coordinator.onUpdate({ deltaMS: 0 } as any);
  }
  await flushMicrotasks(10);
  await untilShown(h.overlay);
}

const movieOn = (overlay: HTMLElement, layer: string) =>
  overlay.querySelector(
    `.${layer} .image video.object`,
  ) as HTMLVideoElement | null;

describe("a movie on a layer, in play", () => {
  test("plays the object URL of a resident file, looping with sound", async () => {
    const { h, media } = await playing({ resident: true });
    await playNext(h);
    const video = movieOn(h.overlay, "portrait");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("src")).toMatch(/^blob:page\//);
    expect(video!.getAttribute("data-src")).toBe(WAVE);
    expect(video!.hasAttribute("playsinline")).toBe(true);
    expect(video!.hasAttribute("preload")).toBe(false);
    expect(video!.loop).toBe(true);
    expect(video!.muted).toBe(false);
    expect(media.of(video, "play")).toBe(1);
    expect(video!.style.visibility).toBe("visible");
  });

  test("plays the file itself when it is not resident", async () => {
    const { h, media } = await playing();
    await playNext(h);
    const video = movieOn(h.overlay, "portrait");
    expect(video!.getAttribute("src")).toBe(WAVE);
    expect(media.of(video, "play")).toBe(1);
  });

  test("`once mute` plays it through, silent, and pauses on its last frame", async () => {
    const { h, media } = await playing();
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait");
    expect(video).not.toBeNull();
    expect(video!.loop).toBe(false);
    expect(video!.muted).toBe(true);
    expect(media.of(video, "play")).toBe(1);
    (video as any).__ended = true;
    video!.dispatchEvent(new (h.overlay.ownerDocument.defaultView as any).Event("ended"));
    expect(media.of(video, "pause")).toBe(1);
    expect(video!.paused).toBe(true);
  });

  test("pauses with the game and resumes with it", async () => {
    const { h, media } = await playing();
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 3;
    video.currentTime = 1;
    h.ui.onPause();
    expect(media.of(video, "pause")).toBe(1);
    expect(video.paused).toBe(true);
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(2);
  });

  test("a `once` movie the game clock has run past while it stalled plays on when the game resumes", async () => {
    const { h, media } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 3;
    clock.elapsedTime = 13.2;
    video.currentTime = 2.2;
    const plays = media.of(video, "play");
    h.ui.onPause();
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays + 1);
    expect(video.currentTime).toBe(2.2);
  });

  test.each([
    { loop: true, expected: 1.5 },
    { loop: false, expected: 3 },
  ])(
    "with the game clock, loop $loop, a seek past its end that the browser stops there with no duration: it ends where it landed",
    async ({ loop, expected }) => {
      const { h } = await playing();
      const clock = { elapsedTime: 10 };
      appOf(h).clock = clock;
      await playNext(h);
      const video = movieOn(h.overlay, "portrait")!;
      video.loop = loop;
      (video as any).__duration = Infinity;
      const event = (type: string) =>
        video.dispatchEvent(
          new (h.overlay.ownerDocument.defaultView as any).Event(type),
        );
      clock.elapsedTime = 14.5;
      video.currentTime = 1;
      event("durationchange");
      h.ui.onUpdate(clock as any);
      expect(video.currentTime).toBeCloseTo(4.5);
      (video as any).__time = 3;
      event("seeked");
      h.ui.onUpdate(clock as any);
      expect(video.currentTime).toBeCloseTo(expected);
    },
  );

  test("a playing loop runs on through the browser's own seek to its start", async () => {
    const { h } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 3;
    const seeked = () =>
      video.dispatchEvent(
        new (h.overlay.ownerDocument.defaultView as any).Event("seeked"),
      );
    const frame = () => h.ui.onUpdate(clock as any);
    clock.elapsedTime = 13.4;
    video.currentTime = 0.05;
    seeked();
    frame();
    expect(video.currentTime).toBe(0.05);
    clock.elapsedTime = 13.5;
    video.currentTime = 0.001;
    seeked();
    expect(video.currentTime).toBe(0.001);
    clock.elapsedTime = 13.6;
    frame();
    expect(video.currentTime).toBe(0.001);
  });

  test("a loop paused at the instant it reaches its end stands on its first frame", async () => {
    const { h } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 3;
    clock.elapsedTime = 13;
    video.currentTime = 3;
    appOf(h).paused = true;
    h.ui.onPause();
    expect(video.currentTime).toBe(0);
  });

  test("a duration learned while the game plays is placed with the clock's reading on its next frame, not with a stale one", async () => {
    const { h } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.loop).toBe(true);
    const frame = () => h.ui.onUpdate(clock as any);
    clock.elapsedTime = 10.5;
    (video as any).__duration = 3;
    video.currentTime = 2;
    video.dispatchEvent(
      new (h.overlay.ownerDocument.defaultView as any).Event("durationchange"),
    );
    expect(video.currentTime).toBe(2);
    clock.elapsedTime = 12.02;
    frame();
    expect(video.currentTime).toBe(2);
  });

  test("a paused loop the clock puts at its start stands on its first frame, not on its last", async () => {
    const { h } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.loop).toBe(true);
    clock.elapsedTime = 16;
    video.currentTime = 6;
    appOf(h).paused = true;
    h.ui.onPause();
    (video as any).__duration = 3;
    video.currentTime = 6;
    expect(video.currentTime).toBe(3);
    video.dispatchEvent(
      new (h.overlay.ownerDocument.defaultView as any).Event("durationchange"),
    );
    expect(video.currentTime).toBe(0);
  });

  test("a movie shown while the game is paused starts when it resumes", async () => {
    const { h, media } = await playing();
    appOf(h).paused = true;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(media.of(video, "play")).toBe(0);
    appOf(h).paused = false;
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(1);
  });

  test("hide pauses the movie, drops its media and clears the layer", async () => {
    const { h, media } = await playing();
    await playNext(h);
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "backdrop");
    expect(video).not.toBeNull();
    expect(media.of(video, "play")).toBe(1);
    await playNext(h);
    expect(media.of(video, "pause")).toBeGreaterThanOrEqual(1);
    expect(media.of(video, "load")).toBe(1);
    expect(video!.hasAttribute("src")).toBe(false);
    expect(video!.isConnected).toBe(false);
    expect(movieOn(h.overlay, "backdrop")).toBeNull();
  });

  test("a layer cleared on continue stops its movie", async () => {
    const { h, media } = await playing();
    await playNext(h);
    const first = movieOn(h.overlay, "portrait");
    await playNext(h);
    expect(first!.isConnected).toBe(false);
    expect(media.of(first, "pause")).toBeGreaterThanOrEqual(1);
    expect(first!.hasAttribute("src")).toBe(false);
  });
});

function pageWithLayer() {
  const { overlay } = installJSDOM();
  const media = stubMedia(overlay);
  const app = createStubApp(overlay, () => {});
  const doc = overlay.ownerDocument;
  const layer = doc.createElement("div");
  layer.className = "backdrop";
  for (const name of ["image", "mask"]) {
    const content = doc.createElement("div");
    content.className = name;
    layer.appendChild(content);
  }
  overlay.appendChild(layer);
  const show = (
    src: string,
    targetAnimations?: WriteImageInstruction["targetAnimations"],
  ) =>
    WriteImageMessage.type.request({
      target: "backdrop",
      instructions: [
        {
          control: "show",
          ...(targetAnimations ? { targetAnimations } : {}),
          content: {
            background: "none",
            imageNames: "rain",
            srcs: [src],
            video: { src, loop: true, muted: false, mixer: "movie", mixerGain: 1 },
          },
        },
      ],
      instant: true,
    });
  return { overlay, media, app, show };
}

describe("a movie on a layer, across runs", () => {
  test("a new run restoring the same movie over the overlay it adopted plays it from its first frame", async () => {
    const { overlay, media, app, show } = pageWithLayer();
    const first = new UIManager(app);
    await first.onInit();
    await first.onReceiveRequest(show(RAIN));
    const video = overlay.querySelector("video.object") as HTMLVideoElement;
    expect(media.of(video, "play")).toBe(1);
    video.currentTime = 1.5;
    first.onDispose();
    expect(video.paused).toBe(true);
    const next = new UIManager(app);
    await next.onInit();
    await next.onReceiveRequest(show(RAIN));
    expect(overlay.querySelector("video.object")).toBe(video);
    expect(video.currentTime).toBe(0);
    expect(media.of(video, "play")).toBe(2);
    expect(video.paused).toBe(false);
    next.onPause();
    expect(video.paused).toBe(true);
  });

  test("a movie still waiting for its layer's reveal when the run ends never starts", async () => {
    const { overlay, media, app, show } = pageWithLayer();
    const g = globalThis as any;
    const Base = g.Animation;
    let reveal!: () => void;
    const revealed = new Promise<void>((resolve) => {
      reveal = resolve;
    });
    g.Animation = class extends Base {
      finished = revealed.then(() => this);
    };
    try {
      const ui = new UIManager(app);
      await ui.onInit();
      const writing = ui.onReceiveRequest(
        show(RAIN, [
          {
            $type: "animation",
            $name: "show",
            target: { $type: "layer", $name: "self" },
            keyframes: [{ opacity: 0 }, { opacity: 1 }],
            timing: { duration: 0.5 },
          } as any,
        ]),
      );
      await flushMicrotasks(10);
      const video = overlay.querySelector("video.object");
      expect(video).not.toBeNull();
      expect(media.of(video, "play")).toBe(0);
      ui.onDispose();
      reveal();
      await writing;
      expect(media.of(video, "play")).toBe(0);
    } finally {
      g.Animation = Base;
    }
  });

  test("a hidden movie's file is not kept resident by its layer's mask", async () => {
    const { overlay, app, show } = pageWithLayer();
    const assets = new AssetManager(app);
    await assets.onInit();
    const ui = new UIManager(app);
    await ui.onInit();
    await ui.onReceiveRequest(show(RAIN));
    expect([...assets.derivedPins()]).toContain(RAIN);
    await ui.onReceiveRequest(
      WriteImageMessage.type.request({
        target: "backdrop",
        instructions: [{ control: "hide" }],
        instant: true,
      }),
    );
    expect(overlay.querySelector("video")).toBeNull();
    expect([...assets.derivedPins()]).not.toContain(RAIN);
  });
});

describe("a movie beside a morphed image", () => {
  const MORPH_SOURCE = `${blinkScript(`  timing {
    duration = 0.25
    easing = linear
    iterations = infinite
  }
`)}
define rain as video with
  src = "${RAIN}"
end



scene start
  HERO:
    [[show portrait bunny]]
    First line.
end
`;
  const MORPH_FILES = [
    {
      uri: "inmemory:///bunny.svg",
      type: "image",
      name: "bunny",
      ext: "svg",
      data: portrait({ dx: 0, dy: 0 }),
    },
  ];

  test.each([
    [["rain", "bunny"]],
    [["bunny", "rain"]],
  ])("the image's morph keeps its place among the images the layer paints (%j)", async (assets) => {
    const writes: any[] = [];
    const h = createDOMHarness(MORPH_SOURCE, 0, {
      files: MORPH_FILES,
      afterEachMessage: (message) => {
        const ops =
          message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) {
          if (op?.method === "ui/write-image") {
            writes.push(op);
          }
        }
      },
    });
    stubMedia(h.overlay);
    MorphPlayback.for(h.overlay).configure({
      host: createMorphHost({
        service: new MorphBakeService(),
        channel: () => h.game.program.morphs,
        readSource: inlineMorphSource(() => h.game.program.context),
      }),
      seed: "test",
      requestFrame: () => 0,
      cancelFrame: () => {},
    });
    await h.ready;
    await h.preview(
      MORPH_SOURCE.split("\n").findIndex((l) => l.includes("First line.")),
    );
    await flushMicrotasks(10);
    await h.game.module.ui.image.write(
      "portrait",
      [{ control: "show", assets } as any],
      true,
    );
    await flushMicrotasks(10);
    const content = writes
      .filter((w) => w.params.target === "portrait")
      .flatMap((w) => w.params.instructions)
      .filter((i: any) => i.content)
      .at(-1)?.content;
    expect(content.video?.src).toBe(RAIN);
    expect(cssList(content.background)).toHaveLength(1);
    expect(content.morph.plays.map((p: any) => p.layer)).toEqual([0]);
  });
});

function soundOf(h: { ui: any }) {
  const { context, sources } = fakeAudioContext();
  const app = appOf(h);
  app.audioContext = context;
  const audio = new AudioManager(app);
  app.audio = audio;
  return { audio, sources };
}

async function playingWithSound(source: string) {
  const { h, media, cache } = await playing({ source });
  return { h, media, cache, ...soundOf(h) };
}

const SOUND_SOURCE = `define bunny_wave as video with
  src = "${WAVE}"
end

define movie as mixer with
  gain = 0.25
end



scene start
  [[show portrait bunny_wave]]
  Waving.
  [[show portrait bunny_wave mute]]
  Waving, silent.
end
`;

describe("a movie's sound", () => {
  test("plays through a media element source into the `movie` mixer, at its gain", async () => {
    const { h, audio, sources } = await playingWithSound(SOUND_SOURCE);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.muted).toBe(false);
    const routed = sources.filter((s) => s.mediaElement === video);
    expect(routed).toHaveLength(1);
    const mixerNode = (audio as any)._audioMixers.get("movie")?.volumeNode;
    expect(mixerNode).toBeTruthy();
    expect(routed[0].outputs).toEqual([mixerNode]);
    expect(mixerNode.gain.value).toBe(0.25);
    await audio.onReceiveRequest(
      ConfigureAudioMixerMessage.type.request({ mixer: "movie", gain: 0.5 }),
    );
    expect(mixerNode.gain.value).toBe(0.5);
    h.ui.onPause();
    h.ui.onUnpause();
    expect(sources.filter((s) => s.mediaElement === video)).toHaveLength(1);
  });

  test("`mute` silences the element, which still plays through the mixer", async () => {
    const { h, audio, sources } = await playingWithSound(SOUND_SOURCE);
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.muted).toBe(true);
    const mixerNode = (audio as any)._audioMixers.get("movie")?.volumeNode;
    const routed = sources.filter((s) => s.mediaElement === video);
    expect(routed).toHaveLength(1);
    expect(routed[0].outputs).toEqual([mixerNode]);
  });

  test("plays through the builtin `movie` mixer when the script defines none", async () => {
    const { h, audio, sources } = await playingWithSound(SOURCE);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    const mixerNode = (audio as any)._audioMixers.get("movie")?.volumeNode;
    expect(mixerNode?.gain.value).toBe(1);
    expect(sources.find((s) => s.mediaElement === video)?.outputs).toEqual([
      mixerNode,
    ]);
  });

  test("a movie a later page plays again keeps its one source, in that page's mixer", async () => {
    const { h, audio, sources } = await playingWithSound(SOUND_SOURCE);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    const [source] = sources.filter((s) => s.mediaElement === video);
    const app = appOf(h);
    const next = new AudioManager(app);
    app.audio = next;
    next.connectMovie(video, "movie", 0.25);
    expect(sources.filter((s) => s.mediaElement === video)).toHaveLength(1);
    const nextNode = (next as any)._audioMixers.get("movie").volumeNode;
    expect(nextNode).not.toBe((audio as any)._audioMixers.get("movie").volumeNode);
    expect(source.outputs).toEqual([nextNode]);
  });

  test("a movie playing before the audio context runs goes through its mixer once it does", async () => {
    const { h } = await playing({ source: SOUND_SOURCE });
    const app = appOf(h);
    const { context, sources } = fakeAudioContext();
    const audio = new AudioManager(app);
    Object.assign(app, {
      audio,
      _manager: { audio },
      _clock: { syncToClock() {} },
      watchAudioContext() {},
    });
    Object.defineProperty(app, "audioContext", {
      configurable: true,
      get() {
        return app._audioContext;
      },
    });
    for (const [mixer, gain] of [
      ["main", 0.8],
      ["movie", 0.25],
    ] as const) {
      await audio.onReceiveRequest(
        ConfigureAudioMixerMessage.type.request({ mixer, gain }),
      );
    }
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.paused).toBe(false);
    expect(sources).toHaveLength(0);
    Application.prototype.setAudioContext.call(app, context);
    const routed = sources.filter((s) => s.mediaElement === video);
    expect(routed).toHaveLength(1);
    const movie = (audio as any)._audioMixers.get("movie");
    const main = (audio as any)._audioMixers.get("main");
    expect(routed[0].outputs).toEqual([movie.volumeNode]);
    expect(movie.volumeNode.gain.value).toBe(0.25);
    expect(main.volumeNode.gain.value).toBe(0.8);
    expect(movie.analyser.outputs).toEqual([main.volumeNode]);
    expect(main.analyser.outputs).toEqual([context.destination]);
  });

  test("a mixer a movie creates plays into a `main` at main's own gain", async () => {
    const { h, audio } = await playingWithSound(SOUND_SOURCE);
    await playNext(h);
    const movie = (audio as any)._audioMixers.get("movie");
    const main = (audio as any)._audioMixers.get("main");
    expect(movie.volumeNode.gain.value).toBe(0.25);
    expect(main.volumeNode.gain.value).toBe(1);
  });

  test("a movie released before the audio context runs is not routed when it does", async () => {
    const { h } = await playing();
    const app = appOf(h);
    const { context, sources } = fakeAudioContext();
    const audio = new AudioManager(app);
    app.audio = audio;
    await playNext(h);
    await playNext(h);
    await playNext(h);
    const rain = movieOn(h.overlay, "backdrop")!;
    await playNext(h);
    expect(rain.isConnected).toBe(false);
    app.audioContext = context;
    audio.onAudioContextRunning();
    expect(sources.filter((s) => s.mediaElement === rain)).toHaveLength(0);
  });

  test("asks for CORS before it loads, so a movie from another origin keeps its sound through the mixer", async () => {
    const { h } = await playingWithSound(SOUND_SOURCE);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.crossOrigin).toBe("anonymous");
    const attributes = video.getAttributeNames();
    expect(attributes.indexOf("crossorigin")).toBeGreaterThanOrEqual(0);
    expect(attributes.indexOf("crossorigin")).toBeLessThan(
      attributes.indexOf("src"),
    );
  });

  test("a hidden movie leaves the mixer", async () => {
    const { h, sources } = await playingWithSound(SOURCE);
    await playNext(h);
    await playNext(h);
    await playNext(h);
    const rain = movieOn(h.overlay, "backdrop")!;
    const routed = sources.find((s) => s.mediaElement === rain);
    expect(routed?.outputs).toHaveLength(1);
    await playNext(h);
    expect(movieOn(h.overlay, "backdrop")).toBeNull();
    expect(routed.outputs).toHaveLength(0);
  });
});

describe("a movie on a layer, in preview", () => {
  test("shows the first frame: metadata only, never played", async () => {
    const line = lineOf("[[show portrait bunny_wave]]");
    const h = createDOMHarness(SOURCE, line);
    const media = stubMedia(h.overlay);
    await h.ready;
    await h.preview(line);
    await flushMicrotasks(10);
    const video = movieOn(h.overlay, "portrait");
    expect(video).not.toBeNull();
    expect(video!.getAttribute("preload")).toBe("metadata");
    expect(video!.getAttribute("src")).toBe(WAVE);
    expect(media.of(video, "play")).toBe(0);
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(0);
    expect(video!.currentTime).toBe(0);
  });
});
