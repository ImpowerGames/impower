// A movie on a layer, on the page (I-1380): a video name shown on a layer
// becomes a `<video class="object">` in the layer's span, loading the asset
// cache's object URL when the file is resident and the file otherwise. Play
// starts it once the layer shows; a preview shows its first frame and never
// starts it. It pauses, resumes and skips with the game, and a hide stops it
// and lets its media go.

import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { WriteImageMessage } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import type { WriteImageInstruction } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { cssList } from "@impower/sparkdown/src/morph/cssList";
import { createMorphHost, inlineMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { blinkScript, portrait } from "@impower/sparkdown/src/tests/morph/fixtures";
import { describe, expect, test, vi } from "vitest";
import AssetManager from "../../app/managers/AssetManager";
import { MorphPlayback } from "../../app/morph/MorphPlayback";
import UIManager from "../../app/managers/UIManager";
import {
  createDOMHarness,
  createStubApp,
  flushMicrotasks,
  installJSDOM,
  untilShown,
} from "./domTestHarness";

// A real game compiles, replays its route and, beside a morph, bakes for
// each test here; on a busy machine that can outlast the default timeout.
vi.setConfig({ testTimeout: 60_000 });

const WAVE = "/file:/proj/bunny_wave.webm?v=1";
const RAIN = "/file:/proj/rain.webm?v=1";

// The builtin `main` layout, as real projects render: its portrait clears on
// continue and its backdrop stays up until something replaces it.
const SOURCE = `define bunny_wave as video with
  src = "${WAVE}"
end

define rain as video with
  src = "${RAIN}"
end

-> start

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

/** jsdom loads and plays no media: a stand-in that records what the page
 *  asked of each element, and keeps the state a browser would report. */
function stubMedia(overlay: HTMLElement) {
  const win = overlay.ownerDocument.defaultView as any;
  const proto = win.HTMLMediaElement.prototype;
  const calls: { method: string; el: HTMLVideoElement }[] = [];
  const define = (name: string, get: (el: any) => unknown, set?: (el: any, v: any) => void) =>
    Object.defineProperty(proto, name, {
      configurable: true,
      get() {
        return get(this);
      },
      set: set
        ? function (this: any, v: any) {
            set(this, v);
          }
        : undefined,
    });
  define("paused", (el) => el.__paused ?? true);
  define("ended", (el) => el.__ended ?? false);
  define("duration", (el) => el.__duration ?? NaN);
  define(
    "currentTime",
    (el) => el.__time ?? 0,
    (el, v) => {
      el.__time = v;
    },
  );
  proto.play = function (this: any) {
    calls.push({ method: "play", el: this });
    this.__paused = false;
    return Promise.resolve();
  };
  proto.pause = function (this: any) {
    calls.push({ method: "pause", el: this });
    this.__paused = true;
  };
  proto.load = function (this: any) {
    calls.push({ method: "load", el: this });
  };
  return {
    calls,
    of: (el: Element | null | undefined, method: string) =>
      calls.filter((c) => c.el === el && c.method === method).length,
  };
}

/** The page's application: the stub the harness built. */
const appOf = (h: { ui: any }) => h.ui.app as any;

/** A page whose game plays on, with the asset cache able to fetch a video
 *  into an object URL when `resident` holds. */
async function playing(opts: { resident?: boolean } = {}) {
  const h = createDOMHarness(SOURCE, 0, { compose: true });
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
    // The `object` style hides an image's sizing element; a movie paints
    // itself.
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

  test("pauses with the game, resumes with it, and skips with its clock", async () => {
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
    h.ui.onSkip(0.5);
    expect(video.currentTime).toBe(1.5);
    // A looping movie skips around its loop, either way.
    h.ui.onSkip(2);
    expect(video.currentTime).toBeCloseTo(0.5);
    h.ui.onSkip(-1);
    expect(video.currentTime).toBeCloseTo(2.5);
  });

  test("skips from where the game clock puts the movie, not from where a seek held it", async () => {
    const { h } = await playing();
    // The game clock's elapsed time, which stops while the game is paused
    // and which a skip does not add to.
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 30;
    // Half a second of game time later, a seek still decoding holds the
    // element at 0.2: the step goes from 0.5, where the clock puts it.
    clock.elapsedTime = 10.5;
    video.currentTime = 0.2;
    h.ui.onSkip(0.1);
    expect(video.currentTime).toBeCloseTo(0.6);
    // And the next step from 0.6 plus the game time since.
    clock.elapsedTime = 10.6;
    video.currentTime = 0.45;
    h.ui.onSkip(0.1);
    expect(video.currentTime).toBeCloseTo(0.8);
    // Back past the start of a loop wraps to its end.
    h.ui.onSkip(-1);
    expect(video.currentTime).toBeCloseTo(29.8);
  });

  test("a `once` movie skipped to its end while paused holds its last frame when the game resumes", async () => {
    const { h, media } = await playing();
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.loop).toBe(false);
    (video as any).__duration = 3;
    video.currentTime = 1;
    h.ui.onPause();
    h.ui.onSkip(5);
    expect(video.currentTime).toBe(3);
    const plays = media.of(video, "play");
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays);
    expect(video.paused).toBe(true);
    // Back inside it, it plays on with the game.
    h.ui.onPause();
    h.ui.onSkip(-1.5);
    expect(video.currentTime).toBe(1.5);
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays + 1);
  });

  test("with the game clock, a `once` movie stays within its span: held at its end, and back inside it after a rewind", async () => {
    const { h, media } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.loop).toBe(false);
    (video as any).__duration = 3;
    clock.elapsedTime = 11;
    video.currentTime = 1;
    // Pause at 1 s and skip past the end: it holds at 3 s on resume.
    h.ui.onPause();
    h.ui.onSkip(5);
    expect(video.currentTime).toBe(3);
    const plays = media.of(video, "play");
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays);
    // Rewind 1.5 s from its end, not from where the skip aimed past it.
    h.ui.onPause();
    h.ui.onSkip(-1.5);
    expect(video.currentTime).toBe(1.5);
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays + 1);
    // Played through to its end on its own, much later in game time, a
    // rewind still lands inside it and it plays on.
    clock.elapsedTime = 40;
    video.currentTime = 3;
    (video as any).__ended = true;
    (video as any).__paused = true;
    h.ui.onPause();
    h.ui.onSkip(-1);
    expect(video.currentTime).toBe(2);
    // The seek back leaves the end.
    (video as any).__ended = false;
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays + 2);
  });

  test("a `once` movie the game clock has run past while it stalled plays on when the game resumes", async () => {
    const { h, media } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    (video as any).__duration = 3;
    // 3.2 s of game time later, a slow start left it at 2.2 s.
    clock.elapsedTime = 13.2;
    video.currentTime = 2.2;
    const plays = media.of(video, "play");
    h.ui.onPause();
    h.ui.onUnpause();
    expect(media.of(video, "play")).toBe(plays + 1);
    expect(video.currentTime).toBe(2.2);
    // And a skip goes from where it stood when the game paused.
    h.ui.onPause();
    h.ui.onSkip(0.5);
    expect(video.currentTime).toBeCloseTo(2.7);
  });

  test("with the game clock, a looping movie of unknown duration rewound past its start steps forward from its start", async () => {
    const { h } = await playing();
    const clock = { elapsedTime: 10 };
    appOf(h).clock = clock;
    await playNext(h);
    const video = movieOn(h.overlay, "portrait")!;
    expect(video.loop).toBe(true);
    // The stub reports no duration, as a file without one does.
    expect(Number.isFinite(video.duration)).toBe(false);
    clock.elapsedTime = 11;
    video.currentTime = 1;
    h.ui.onPause();
    h.ui.onSkip(-2);
    expect(video.currentTime).toBe(0);
    h.ui.onSkip(0.5);
    expect(video.currentTime).toBe(0.5);
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

/** A page with one layer, `layer`, holding `image` and `mask` content, and
 *  the write that shows `src` on it as a movie. */
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
            video: { src, loop: true, muted: false },
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
    // STOP, then a new run whose restore writes the same movie.
    first.onDispose();
    expect(video.paused).toBe(true);
    const next = new UIManager(app);
    await next.onInit();
    await next.onReceiveRequest(show(RAIN));
    expect(overlay.querySelector("video.object")).toBe(video);
    expect(video.currentTime).toBe(0);
    expect(media.of(video, "play")).toBe(2);
    expect(video.paused).toBe(false);
    // And the new run's clock reaches it.
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

-> start

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

describe("a movie on a layer, in preview", () => {
  test("shows the first frame: metadata only, never played", async () => {
    // The show is a beat of its own, and the portrait clears on the next.
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
    // The game's clock does not reach a preview's movie.
    h.ui.onUnpause();
    h.ui.onSkip(1);
    expect(media.of(video, "play")).toBe(0);
    expect(video!.currentTime).toBe(0);
  });
});
