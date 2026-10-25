// A movie on a layer, on the page (I-1380): a video name shown on a layer
// becomes a `<video class="object">` in the layer's span, loading the asset
// cache's object URL when the file is resident and the file otherwise. Play
// starts it once the layer shows; a preview shows its first frame and never
// starts it. It pauses, resumes and skips with the game, and a hide stops it
// and lets its media go.

import { Coordinator } from "@impower/spark-engine/src/game/core/classes/Coordinator";
import { describe, expect, test } from "vitest";
import {
  createDOMHarness,
  flushMicrotasks,
  untilShown,
} from "./domTestHarness";

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
