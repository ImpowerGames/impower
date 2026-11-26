import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { buildMorphMotion, morphMotionKeyframes } from "@impower/sparkdown/src/morph/motion";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRecipe, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, talk, talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import type { MorphLayerPlay, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureViewOf } from "../../../spark-dom/src/utils/placePicture";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../src/app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SOURCE = `layout main {
  stage {
    portrait {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
}

scene start
  Nothing yet.
end
`;

const BOX = { width: 400, height: 300 };
const SIZE = `${BOX.width}x${BOX.height}`;
const FILE = "/src/nova.svg";
const ART = talkingPortrait();
const NATURAL = { width: 160, height: 120 };

interface Drawn {
  src: string;
  text?: string;
}

const vector = (src: string, art = ART): PictureBitmap => ({ image: { src } as never, ...NATURAL, vector: { text: art, viewBox: true, src } as never });

const speech = (overrides: Partial<MorphTiming> = {}): MorphTiming =>
  ({ trigger: "speech", duration: 0.4, delay: 0, easing: "linear", iterations: 1, direction: "normal", ...overrides }) as MorphTiming;

const loop = (overrides: Partial<MorphTiming> = {}): MorphTiming =>
  ({ duration: 0.2, delay: 0, easing: "linear", iterations: "infinite", direction: "normal", iteration_delay_min: 0.3, iteration_delay_max: 0.3, ...overrides }) as MorphTiming;

const play = (key: string, morphs: string[], morph: string, timing: MorphTiming, extra: Partial<MorphLayerPlay> = {}): MorphLayerPlay => ({
  layer: 0,
  ref: { morphs, key, image: "nova", selection: "{}", groups: ["mouth", "eyes"] },
  morph,
  owner: "nova",
  timing,
  definition: "d",
  ...extra,
});

const show = (plays: MorphLayerPlay[]): WriteImageParams => ({
  target: "portrait",
  instant: false,
  instructions: [
    {
      control: "show",
      content: {
        background: `url("${FILE}")`,
        imageNames: "nova",
        srcs: [FILE],
        pictures: [{ layer: 0, span: 1, name: "nova", vector: true, files: [{ src: FILE, name: "nova.svg" }] }],
        morph: { plays, epoch: 0 },
      },
    },
  ],
});

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function setup(recipes: Record<string, MorphRecipe>, art = ART) {
  const h = createDOMHarness(SOURCE, 0, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, 0);
  await untilShown(h.overlay);
  const win = h.overlay.ownerDocument.defaultView as Window & typeof globalThis;
  const effect = (win as unknown as { KeyframeEffect: { prototype: Record<string, unknown> } }).KeyframeEffect.prototype;
  effect["getTiming"] ??= () => ({ delay: 0, duration: 0 });
  effect["getComputedTiming"] ??= () => ({ progress: 0, endTime: 0 });
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, value: 1 });
  const sheet = win.document.createElement("style");
  sheet.textContent = `.image > .instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; }`;
  win.document.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  const laidOut = (el: HTMLElement) => el.classList.contains("instance");
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? BOX.width : 0; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? BOX.height : 0; } });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const zoom = laidOut(this) ? pictureViewOf(this).zoom : 0;
      const across = BOX.width * zoom;
      const down = BOX.height * zoom;
      return { x: 0, y: 0, left: 0, top: 0, right: across, bottom: down, width: across, height: down, toJSON() {} };
    },
  });
  const events: string[] = [];
  const paints: { canvas: HTMLCanvasElement; draws: Drawn[] }[] = [];
  const rasterized: { text?: string; src?: string; size: string; image: Drawn; release: ReturnType<typeof vi.fn> }[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    host: createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: Object.fromEntries(Object.entries(recipes).map(([name, recipe]) => [name, serializeMorphRecipe(recipe)])), variants: {} }),
      readSource: async () => ({ text: art }),
    }),
    pictureCanvas: (canvas) => {
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          paints.push({ canvas, draws: [] });
        },
        drawImage(image) {
          paints.at(-1)?.draws.push(image as unknown as Drawn);
        },
      };
      return context;
    },
    loadPicture: async (src) => vector(src, art),
    rasterizeSvgLayer: (source, _natural, w, h) => {
      const src = (source as unknown as { src?: string }).src;
      const image: Drawn = src ? { src } : { src: `pose ${rasterized.length}`, text: source.text };
      const release = vi.fn();
      rasterized.push({ ...(src ? { src } : { text: source.text }), size: `${w}x${h}`, image, release });
      events.push(src ? `rest ${w}x${h}` : `pose ${w}x${h}`);
      return Promise.resolve({ image: image as never, release });
    },
  });
  playback.placeholders = true;
  const reports = vi.fn();
  playback.reportStill = reports;
  const ui = h.ui as unknown as { applyBeat: (...args: unknown[]) => void };
  const apply = ui.applyBeat.bind(h.ui);
  ui.applyBeat = (...args: unknown[]) => {
    events.push("applied");
    apply(...args);
  };
  let id = 0;
  const beat = (writes: WriteImageParams[], line = 20) => {
    h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "ui/beat",
      params: {
        messages: writes.map((params) => ({ jsonrpc: "2.0", id: `write-${++id}`, method: "ui/write-image", params })),
        source: { uri: "file:///main.sd", range: { start: { line, character: 0 }, end: { line, character: 1 } } },
      },
    } as never);
  };
  const layer = () => [...((playback as unknown as { layers: Set<any> }).layers)].at(-1);
  const artifact = (): MorphArtifact => layer().images[0].slot.artifact;
  const shown = (): Drawn | undefined => {
    const canvas = layer()?.stills[0]?.canvases?.[0]?.canvas;
    const last = [...paints].reverse().find((paint) => paint.canvas === canvas);
    return last?.draws[0];
  };
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return { h, events, paints, rasterized, reports, beat, playback, layer, artifact, shown };
}

function leafStates(markup: string): string {
  const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
  return JSON.stringify(
    Array.from(doc.querySelectorAll("[data-morph]")).map((element) => [
      element.getAttribute("data-morph"),
      !/display:\s*none/.test(element.getAttribute("style") ?? ""),
      element.getAttribute("d"),
    ]),
  );
}

function liveOffsets(playback: MorphPlayback, plays: MorphLayerPlay[]): Record<string, number> {
  const occurrences = (playback as unknown as { occurrences: Map<string, any> }).occurrences;
  const offsets: Record<string, number> = {};
  for (const occurrence of occurrences.values()) {
    const head = playback.playhead(occurrence);
    if (!("offset" in head)) continue;
    const morph = plays.find((entry) => occurrence.key.includes(`|${entry.morph}|`))?.morph;
    if (morph) offsets[morph] = head.offset;
  }
  return offsets;
}

const CUT = { talk: talk({ blend: "cut", clips: [] }), blink: blink({ blend: "cut", clips: [] }) };

describe("a drawn portrait's morphs play from frames drawn before the beat fires (#2812)", () => {
  test("each pose of a cut morph is drawn once before the beat is applied, and every pose change after it draws only from pixels already made", async () => {
    const t = await setup(CUT);
    const plays = [play("nova-cut", ["talk", "blink"], "talk", speech()), play("nova-cut", ["talk", "blink"], "blink", loop())];
    t.beat([show(plays)]);
    await until(() => t.events.includes("applied"), "the beat");
    const made = t.rasterized.length;
    const applied = t.events.indexOf("applied");
    expect(t.events.slice(0, applied).filter((event) => event.startsWith("rest"))).toEqual([`rest ${SIZE}`]);
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBeGreaterThan(0);
    expect(t.events.slice(applied + 1)).toEqual([]);
    expect(new Set(poses.map((entry) => leafStates(entry.text!))).size).toBe(poses.length);
    expect(poses.every((entry) => entry.size === SIZE)).toBe(true);
    const artifact = t.artifact();
    const restLeaves = leafStates(renderMorphAt(artifact, {}));
    const combos = new Set<string>();
    for (const mouth of [0, 0.5]) for (const eyes of [0, 0.333]) combos.add(leafStates(renderMorphAt(artifact, { talk: mouth, blink: eyes })));
    combos.delete(restLeaves);
    expect(new Set(poses.map((entry) => leafStates(entry.text!)))).toEqual(combos);

    const pixels = new Set(t.rasterized.map((entry) => entry.image));
    t.playback.speak("nova", [[0, 1.2]]);
    const seen = new Set<string>();
    for (let i = 0; i < 90; i++) {
      t.playback.advance(0.017);
      await flushMicrotasks(2);
      const drawn = t.shown()!;
      expect(pixels.has(drawn)).toBe(true);
      const live = leafStates(renderMorphAt(artifact, liveOffsets(t.playback, plays)));
      const offsets = liveOffsets(t.playback, plays);
      const expected = Object.keys(offsets).length ? live : restLeaves;
      expect(drawn.text === undefined ? restLeaves : leafStates(drawn.text)).toBe(expected);
      seen.add(drawn.src);
    }
    expect(seen.size).toBeGreaterThan(2);
    expect(t.rasterized).toHaveLength(made);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("the beat waits for its morph's poses, and its ready mark follows the last one", async () => {
    const t = await setup(CUT);
    let hold: (() => void) | undefined;
    const rasterize = t.playback.rasterizeSvgLayer;
    t.playback.configure({
      rasterizeSvgLayer: (source, natural, w, h, doc) => {
        if ((source as unknown as { src?: string }).src) return rasterize(source, natural, w, h, doc);
        return new Promise((resolve) => {
          hold = () => void rasterize(source, natural, w, h, doc).then(resolve);
        });
      },
    });
    t.beat([show([play("nova-wait", ["talk"], "talk", speech())])], 30);
    await until(() => hold !== undefined, "the first pose to start drawing");
    await flushMicrotasks(10);
    expect(t.events).not.toContain("applied");
    for (let i = 0; i < 20 && !t.events.includes("applied"); i++) {
      const next = hold!;
      hold = undefined;
      next();
      await until(() => hold !== undefined || t.events.includes("applied"), "the next pose or the beat");
    }
    expect(t.events.at(-1)).toBe("applied");
    expect(t.events.filter((event) => event.startsWith("pose")).length).toBeGreaterThan(0);
  });
});

const TWEEN = { blink: blink({ clips: [] }) };

describe("a drawn portrait's smooth tween plays from frames drawn at `morph_frame_rate` (#2812)", () => {
  const frames = async (rate: number | undefined, easing: string) => {
    const t = await setup(TWEEN);
    if (rate !== undefined) {
      t.h.ui.onReceiveNotification({
        jsonrpc: "2.0",
        method: "assets/configure",
        params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 8, restoreTimeout: 2, morphFrameRate: rate },
      } as never);
    }
    t.beat([show([play(`nova-tween-${rate}-${easing}`, ["blink"], "blink", loop({ duration: 1, easing, iteration_delay_min: 0, iteration_delay_max: 0 }))])]);
    await until(() => t.events.includes("applied"), "the beat");
    const applied = t.events.indexOf("applied");
    return { t, drawn: t.events.slice(0, applied).filter((event) => event.startsWith("rest") || event.startsWith("pose")).length };
  };

  test("a tween of one second at the default rate has 24 frames drawn before the beat is applied", async () => {
    const { t, drawn } = await frames(undefined, "linear");
    expect(drawn).toBe(24);
    const made = t.rasterized.length;
    const pixels = new Set(t.rasterized.map((entry) => entry.image));
    const seen = new Set<Drawn>();
    for (let i = 0; i < 70; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      const now = t.shown()!;
      expect(pixels.has(now)).toBe(true);
      seen.add(now);
    }
    expect(seen.size).toBeGreaterThan(20);
    expect(t.rasterized).toHaveLength(made);
  });

  test("a `steps(4)` tween has four frames", async () => {
    expect((await frames(undefined, "steps(4)")).drawn).toBe(4);
  });

  test("`morph_frame_rate = 12` gives twelve", async () => {
    expect((await frames(12, "linear")).drawn).toBe(12);
  });

  test("`morph_frame_rate = 0` holds a smooth tween at its rest pose, and a `steps(4)` tween keeps its four", async () => {
    expect((await frames(0, "linear")).drawn).toBe(1);
    cleanup?.();
    cleanup = undefined;
    expect((await frames(0, "steps(4)")).drawn).toBe(4);
  });
});

describe("a tween that does not fit what `predict_cache_size` leaves (#2812)", () => {
  const budgeted = async (frames: number) => {
    const t = await setup(TWEEN);
    const cache = (t.h.ui as unknown as { app: { assetCache: { configure(options: { predictBytes: number }): void } } }).app.assetCache;
    cache.configure({ predictBytes: frames * BOX.width * BOX.height * 4 });
    t.beat([show([play(`nova-budget-${frames}`, ["blink"], "blink", loop({ duration: 1, iteration_delay_min: 0, iteration_delay_max: 0 }))])]);
    await until(() => t.events.includes("applied"), "the beat");
    return t;
  };

  test("is drawn with fewer frames that still play, with no warning", async () => {
    const t = await budgeted(6);
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBeGreaterThan(1);
    expect(poses.length).toBeLessThanOrEqual(6);
    const seen = new Set<Drawn>();
    for (let i = 0; i < 70; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      seen.add(t.shown()!);
    }
    expect(seen.size).toBe(poses.length + 1);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("with no room holds the rest pose, with no warning", async () => {
    const t = await budgeted(0.5);
    expect(t.rasterized.filter((entry) => entry.text !== undefined)).toEqual([]);
    const rest = t.shown();
    expect(rest?.src).toBe(FILE);
    for (let i = 0; i < 70; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      expect(t.shown()).toBe(rest);
    }
    expect(t.reports).not.toHaveBeenCalled();
  });
});

describe("a morph that moves a labelled layer plays from drawn frames like any tween (#2812)", () => {
  test("each frame draws the layer as the browser's animation of its keyframes leaves it at that offset, and the movement plays after the beat only from those frames", async () => {
    const keyframes = [
      { offset: 0, eyes: { state: "open" } },
      { offset: 0.5, eyes: { state: "closed" }, nose: { translate: "0 -2px", rotate: "2deg", opacity: 0.5 } },
      { offset: 1, eyes: { state: "open" } },
    ];
    const motion = buildMorphMotion(keyframes)!;
    const t = await setup({ blink: blink({ clips: [], keyframes }) });
    const animated: { keyframes: Keyframe[]; connected: boolean }[] = [];
    t.playback.configure({
      animate: (element, frames) => {
        let at = 0;
        animated.push({ keyframes: frames, connected: element.isConnected });
        return {
          sample: (offset) => {
            at = offset;
          },
          commit: () => element.setAttribute("style", `${element.getAttribute("style") ?? ""};--sampled:${at}`),
          cancel: () => {},
        };
      },
    });
    t.beat([show([play("nova-motion", ["blink"], "blink", loop({ duration: 1, iteration_delay_min: 0, iteration_delay_max: 0 }), { motion })])]);
    await until(() => t.events.includes("applied"), "the beat");
    const sampled = (markup: string) => /--sampled:([0-9.e-]+)/.exec(new DOMParser().parseFromString(markup, "image/svg+xml").querySelector('[data-morph-motion="nose"]')?.getAttribute("style") ?? "")?.[1];
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBe(24);
    expect(new Set(poses.map((pose) => Number(sampled(pose.text!))))).toEqual(new Set(Array.from({ length: 24 }, (_, k) => k / 24)));
    expect(animated.every(({ keyframes: frames, connected }) => connected && JSON.stringify(frames) === JSON.stringify(morphMotionKeyframes(motion["nose"]!)))).toBe(true);
    const made = t.rasterized.length;
    for (let i = 0; i < 70; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      const offset = liveOffsets(t.playback, [play("", [], "blink", loop())])["blink"];
      const drawn = t.shown()!;
      if (offset === undefined) {
        expect(drawn.src).toBe(FILE);
        continue;
      }
      const frame = Math.round(offset * 24) / 24;
      expect(Number(sampled(drawn.text!))).toBe(frame === 1 ? 0 : frame);
    }
    expect(t.rasterized).toHaveLength(made);
  });
});

describe("planning a picture's poses is bounded before any pose is listed (#2812)", () => {
  const LONG = { talk: talk({ clips: [] }), blink: blink({ clips: [] }) };
  const longPlays = () => [
    play("nova-long", ["talk", "blink"], "talk", loop({ duration: 5, iteration_delay_min: 0, iteration_delay_max: 0 })),
    play("nova-long", ["talk", "blink"], "blink", loop({ duration: 5, iteration_delay_min: 0, iteration_delay_max: 0 })),
  ];

  test("two five-second smooth morphs with no room hold the rest pose, planned without listing their combinations", async () => {
    const t = await setup(LONG);
    t.playback.frameBudget = () => 0;
    t.beat([show(longPlays())]);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.rasterized.filter((entry) => entry.text !== undefined)).toEqual([]);
    const layer = t.layer();
    const image = layer.images[0];
    const started = performance.now();
    const set = layer.planPoses(image, image.slot.artifact, { width: BOX.width, height: BOX.height });
    const elapsed = performance.now() - started;
    expect(set.frames.size).toBe(0);
    expect(set.keys.size).toBe(1);
    expect(elapsed).toBeLessThan(100);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("six independent switching morphs list at most 1024 combinations and draw at most 256 poses, the later ones holding the rest pose, even with no room", async () => {
    const GROUPS = Array.from({ length: 6 }, (_, k) => `g${k + 1}`);
    const STATES = ["a", "b", "c"];
    const art = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120">
<path data-name="face" d="M0,0H160V120H0Z" fill="#c96"/>
${GROUPS.map((group, k) => STATES.map((state, j) => `<g data-name="${group}.${state}${j === 0 ? " default" : ""}"><path data-name="${group}-${state}" d="M${10 + k * 24},${20 + j * 30}h16v${8 + j * 4}h-16Z" fill="#123"/></g>`).join("\n")).join("\n")}
</svg>`;
    const recipes = Object.fromEntries(
      GROUPS.map((group, k) => [
        `m${k + 1}`,
        buildMorphRecipe(`m${k + 1}`, { blend: "cut", keyframes: STATES.map((state, j) => ({ offset: j / 2, [group]: { state } })) } as never),
      ]),
    );
    const t = await setup(recipes, art);
    t.playback.frameBudget = () => 0;
    const morphs = Object.keys(recipes);
    const plays = morphs.map((morph) => ({ ...play("nova-six", morphs, morph, loop({ duration: 0.6 })), ref: { morphs, key: "nova-six", image: "nova", selection: "{}", groups: GROUPS } }));
    t.beat([show(plays)]);
    await until(() => t.events.includes("applied"), "the beat");
    const layer = t.layer();
    const image = layer.images[0];
    expect(image.slot.artifact.status).toBe("live");
    const set = image.poses.sets[0];
    expect(set.keys.size).toBeLessThanOrEqual(1024);
    expect(set.grids).toEqual([undefined, undefined, undefined, 0, 0, 0]);
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBe(26);
    const started = performance.now();
    const again = layer.planPoses(image, image.slot.artifact, { width: BOX.width, height: BOX.height });
    expect(performance.now() - started).toBeLessThan(100);
    expect(again.frames.size).toBe(26);
    const pixels = new Set(t.rasterized.map((entry) => entry.image));
    for (let i = 0; i < 40; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      expect(pixels.has(t.shown()!)).toBe(true);
    }
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("with unlimited room they are drawn with at most 256 frames, from at most 1024 listed combinations", async () => {
    const t = await setup(LONG);
    t.playback.frameBudget = () => Infinity;
    t.beat([show(longPlays())]);
    await until(() => t.events.includes("applied"), "the beat");
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBeGreaterThan(24);
    expect(poses.length).toBeLessThanOrEqual(256);
    const layer = t.layer();
    const set = layer.images[0].poses.sets[0];
    expect(set.keys.size).toBeLessThanOrEqual(1024);
    expect(set.grids.every((grid: number | undefined) => grid !== undefined && grid > 0 && grid < 120)).toBe(true);
  });
});
