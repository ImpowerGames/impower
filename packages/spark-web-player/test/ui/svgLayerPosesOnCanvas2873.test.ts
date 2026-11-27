import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact, MorphRecipe, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, talk, talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import type { MorphLayerPlay, MorphPlay, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
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
const NATURAL = { width: 160, height: 120 };
const FACE = "/src/nova.svg";
const BODY = "/src/body.svg";
const BASE = "/src/base.png";
const ART = talkingPortrait();
const BODY_ART = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120" width="160" height="120"><path d="M0,80H160V120H0Z" fill="#358"/></svg>`;
const GROUPED =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
  '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
  '<g data-name="face"><image data-name="nova" data-layer="1" x="0" y="0" width="100" height="100"/></g></svg>';

interface Drawn {
  src: string;
  text?: string;
}

const speech = (): MorphTiming => ({ trigger: "speech", duration: 0.4, delay: 0, easing: "linear", iterations: 1, direction: "normal" }) as MorphTiming;

const loop = (): MorphTiming =>
  ({ duration: 0.2, delay: 0, easing: "linear", iterations: "infinite", direction: "normal", iteration_delay_min: 0.3, iteration_delay_max: 0.3 }) as MorphTiming;

const RECIPES: Record<string, MorphRecipe> = {
  talk: talk({ blend: "cut", clips: [] }),
  blink: blink({ blend: "cut", clips: [] }),
  sway: buildMorphRecipe("sway", { blend: "cut", keyframes: [{ offset: 0, face: { opacity: "1" } }, { offset: 1, face: { opacity: "50%" } }] } as never),
};

const facePlays = (key: string): MorphPlay[] => [
  { ref: { morphs: ["talk", "blink"], key, image: "nova", selection: "{}", groups: ["mouth", "eyes"] }, morph: "talk", owner: "nova", timing: speech(), definition: "t" },
  { ref: { morphs: ["talk", "blink"], key, image: "nova", selection: "{}", groups: ["mouth", "eyes"] }, morph: "blink", owner: "nova", timing: loop(), definition: "b" },
];

const layeredShow = (key: string): WriteImageParams => ({
  target: "portrait",
  instant: false,
  instructions: [
    {
      control: "show",
      content: {
        background: `url("${FACE}"), url("${BODY}")`,
        imageNames: "kit",
        srcs: [BODY, FACE],
        pictures: [{ layer: 0, span: 2, name: "kit", vector: true, files: [{ src: BODY, name: "body.svg" }, { src: FACE, name: "nova.svg" }] }],
        morph: { plays: facePlays(key).map((play): MorphLayerPlay => ({ layer: 1, ...play })), epoch: 0 },
      },
    },
  ],
});

const pictureShow = (key: string): WriteImageParams => ({
  target: "portrait",
  instant: false,
  instructions: [
    {
      control: "show",
      content: {
        background: `url("${FACE}"), url("${BASE}")`,
        imageNames: "kit",
        srcs: [BASE, FACE],
        pictures: [{ layer: 0, span: 2, name: "kit", vector: true, files: [{ src: BASE, name: "base.png" }, { src: FACE, name: "nova.svg" }] }],
        morph: {
          plays: [
            {
              layer: 0,
              picture: { span: 2, files: [{ src: BASE, name: "base.png", layer: 0 }, { src: FACE, name: "nova.svg", layer: 1, plays: facePlays(key) }] },
              ref: { morphs: ["sway"], key: `${key}-picture`, image: "kit", selection: "{}", groups: [] },
              morph: "sway",
              owner: "kit",
              timing: loop(),
              motion: { face: [{ offset: 0, values: { opacity: "1" } }, { offset: 1, values: { opacity: "0.5" } }] },
              definition: "s",
            },
          ],
          epoch: 0,
        },
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

function liveOffsets(playback: MorphPlayback): Record<string, number> {
  const occurrences = (playback as unknown as { occurrences: Map<string, any> }).occurrences;
  const offsets: Record<string, number> = {};
  for (const occurrence of occurrences.values()) {
    const head = playback.playhead(occurrence);
    if (!("offset" in head)) continue;
    const morph = ["talk", "blink"].find((name) => occurrence.key.includes(`|${name}|`));
    if (morph) offsets[morph] = head.offset;
  }
  return offsets;
}

async function setup() {
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
  const rasterized: { text?: string; src?: string; size: string; image: Drawn }[] = [];
  const reports = vi.fn();
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    host: createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: Object.fromEntries(Object.entries(RECIPES).map(([name, recipe]) => [name, serializeMorphRecipe(recipe)])), variants: {} }),
      readSource: async (ref) => ({ text: ref.key.endsWith("-picture") ? GROUPED : ART }),
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
    loadPicture: async (src): Promise<PictureBitmap> =>
      src.endsWith(".png")
        ? { image: { src } as never, ...NATURAL }
        : { image: { src } as never, ...NATURAL, vector: { text: src === BODY ? BODY_ART : ART, viewBox: true, src } as never },
    rasterizeSvgLayer: (source, _natural, w, h) => {
      const src = (source as unknown as { src?: string }).src;
      const image: Drawn = src ? { src } : { src: `pose ${rasterized.length}`, text: source.text };
      rasterized.push({ ...(src ? { src } : { text: source.text }), size: `${w}x${h}`, image });
      events.push(src ? `rest ${w}x${h}` : `pose ${w}x${h}`);
      return Promise.resolve({ image: image as never, release: () => {} });
    },
  });
  playback.placeholders = true;
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
  const layer = () => [...(playback as unknown as { layers: Set<any> }).layers].at(-1);
  const shadow = () => (layer()?.span as HTMLElement | undefined)?.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const last = (canvas: HTMLCanvasElement | undefined) => [...paints].reverse().find((paint) => paint.canvas === canvas);
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return { h, events, rasterized, reports, beat, playback, layer, shadow, last };
}

type Setup = Awaited<ReturnType<typeof setup>>;

async function playsFromDrawnPoses(t: Setup, shown: () => Drawn | undefined, artifact: () => MorphArtifact, rest: string) {
  const restLeaves = leafStates(renderMorphAt(artifact(), {}));
  const made = t.rasterized.length;
  const pixels = new Set(t.rasterized.map((entry) => entry.image));
  t.playback.speak("nova", [[0, 1.2]]);
  const seen = new Set<string>();
  for (let i = 0; i < 90; i++) {
    t.playback.advance(0.017);
    await flushMicrotasks(2);
    const drawn = shown()!;
    expect(drawn.src === rest || pixels.has(drawn)).toBe(true);
    const offsets = liveOffsets(t.playback);
    const expected = Object.keys(offsets).length ? leafStates(renderMorphAt(artifact(), offsets)) : restLeaves;
    expect(drawn.text === undefined ? restLeaves : leafStates(drawn.text)).toBe(expected);
    seen.add(drawn.src);
  }
  expect(seen.size).toBeGreaterThan(2);
  expect(t.rasterized).toHaveLength(made);
}

describe("a morph on one layer of a multi-layer vector picture is drawn on the picture's canvas from poses drawn before the beat (#2873)", () => {
  test("every pose of the layer is drawn before the beat is applied, the picture's canvas draws the layer from them in its place, and no live view is built", async () => {
    const t = await setup();
    t.beat([layeredShow("nova-layered")]);
    await until(() => t.events.includes("applied"), "the beat");
    const applied = t.events.indexOf("applied");
    expect(t.events.slice(0, applied).filter((event) => event.startsWith("rest"))).toEqual([`rest ${SIZE}`, `rest ${SIZE}`]);
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBeGreaterThan(0);
    expect(poses.every((entry) => entry.size === SIZE)).toBe(true);
    expect(t.events.slice(applied + 1)).toEqual([]);
    expect(t.shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
    const still = t.layer().stills[0];
    expect(still.canvases.map((view: any) => view.segment.layers)).toEqual([[0, 1]]);
    expect(t.shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    const canvas = still.canvases[0].canvas as HTMLCanvasElement;
    expect(t.last(canvas)!.draws.map((draw) => draw.src)).toEqual([BODY, FACE]);
    const artifact = () => t.layer().images[0].slot.artifact as MorphArtifact;
    await playsFromDrawnPoses(
      t,
      () => {
        const draws = t.last(canvas)!.draws;
        expect(draws).toHaveLength(2);
        expect(draws[0]!.src).toBe(BODY);
        return draws[1];
      },
      artifact,
      FACE,
    );
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("the beat waits for the layer's poses", async () => {
    const t = await setup();
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
    t.beat([layeredShow("nova-layered-wait")], 30);
    await until(() => hold !== undefined, "the first pose to start drawing");
    let released = 0;
    for (let i = 0; i < 40 && !t.events.includes("applied"); i++) {
      await flushMicrotasks(10);
      if (t.events.includes("applied")) break;
      expect(t.layer().drawn).toBe(false);
      const next = hold!;
      hold = undefined;
      next();
      released += 1;
      await until(() => hold !== undefined || t.events.includes("applied"), "the next pose or the beat");
    }
    expect(released).toBeGreaterThan(1);
    expect(t.events.at(-1)).toBe("applied");
    expect(t.layer().images[0].poses.sets[0].queue).toEqual([]);
  });
});

describe("an SVG layer with its own morphs inside a picture its own morph drives is drawn on the picture's canvas from poses drawn before the beat (#2873)", () => {
  test("every pose of the SVG layer is drawn before the beat is applied, the picture's canvas draws the layer from them in its slot, and no live view is built", async () => {
    const t = await setup();
    t.beat([pictureShow("nova-inner")]);
    await until(() => t.events.includes("applied"), "the beat");
    const applied = t.events.indexOf("applied");
    const poses = t.rasterized.filter((entry) => entry.text !== undefined);
    expect(poses.length).toBeGreaterThan(0);
    expect(poses.every((entry) => entry.size === SIZE)).toBe(true);
    expect(t.events.slice(applied + 1)).toEqual([]);
    expect(t.shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
    const image = t.layer().images[0];
    expect(image.canvas).toBeDefined();
    expect(t.shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    const canvas = image.canvas.canvas as HTMLCanvasElement;
    expect(t.shadow()!.querySelector("canvas")).toBe(canvas);
    expect([canvas.width, canvas.height]).toEqual([BOX.width, BOX.height]);
    expect(t.last(canvas)!.draws.map((draw) => draw.src)).toEqual([BASE, FACE]);
    const inner = () => image.inner[0].slot.artifact as MorphArtifact;
    await playsFromDrawnPoses(
      t,
      () => {
        const draws = t.last(canvas)!.draws;
        expect(draws).toHaveLength(2);
        expect(draws[0]!.src).toBe(BASE);
        return draws[1];
      },
      inner,
      FACE,
    );
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("the beat waits for the SVG layer's poses", async () => {
    const t = await setup();
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
    t.beat([pictureShow("nova-inner-wait")], 40);
    await until(() => hold !== undefined, "the first pose to start drawing");
    let released = 0;
    for (let i = 0; i < 40 && !t.events.includes("applied"); i++) {
      await flushMicrotasks(10);
      if (t.events.includes("applied")) break;
      expect(t.layer().drawn).toBe(false);
      const next = hold!;
      hold = undefined;
      next();
      released += 1;
      await until(() => hold !== undefined || t.events.includes("applied"), "the next pose or the beat");
    }
    expect(released).toBeGreaterThan(1);
    expect(t.events.at(-1)).toBe("applied");
    expect(t.layer().images[0].inner[0].poses.sets[0].queue).toEqual([]);
  });

  test("a picture zoomed to twice its size draws the SVG layer's poses and its canvas at twice the size, as the live view drew its vectors", async () => {
    for (const [write, key] of [
      [pictureShow, "nova-inner-zoom"],
      [layeredShow, "nova-layered-zoom"],
    ] as const) {
      const t = await setup();
      t.beat([write(key)], 47);
      await until(() => t.events.includes("applied"), "the beat");
      const layer = t.layer();
      const owner = () => (layer.images[0].picture ? layer.images[0].inner[0] : layer.images[0]);
      const canvas = (): HTMLCanvasElement => layer.images[0].canvas?.canvas ?? layer.stills[0].canvases[0].canvas;
      expect([canvas().width, canvas().height]).toEqual([BOX.width, BOX.height]);
      layer.size({ zoom: 2 });
      const doubled = `${BOX.width * 2}x${BOX.height * 2}`;
      await until(() => owner().poses?.sets.some((set: any) => `${set.width}x${set.height}` === doubled && set.queue.length === 0 && !set.running), `poses at ${doubled}`);
      await until(() => canvas().width === BOX.width * 2 && canvas().height === BOX.height * 2, `the canvas at ${doubled}`);
      expect(t.rasterized.filter((entry) => entry.text !== undefined && entry.size === doubled).length).toBeGreaterThan(0);
      cleanup?.();
      cleanup = undefined;
    }
  });

  test("rebuilding the picture keeps the SVG layer's drawn poses, so nothing is drawn again", async () => {
    const t = await setup();
    t.beat([pictureShow("nova-inner-rebuild")], 45);
    await until(() => t.events.includes("applied"), "the beat");
    const layer = t.layer();
    const sets = layer.images[0].inner[0].poses.sets;
    const made = t.rasterized.length;
    layer.build();
    await flushMicrotasks(10);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(layer.images[0].inner[0].poses.sets).toEqual(sets);
    expect(sets.every((set: any) => !set.released)).toBe(true);
    expect(t.rasterized).toHaveLength(made);
    expect(layer.drawn).toBe(true);
  });

  test("a pose the browser will not draw leaves the SVG layer's rest in its slot and warns once", async () => {
    const t = await setup();
    const rasterize = t.playback.rasterizeSvgLayer;
    t.playback.configure({
      rasterizeSvgLayer: (source, natural, w, h, doc) => ((source as unknown as { src?: string }).src ? rasterize(source, natural, w, h, doc) : Promise.resolve(undefined)),
    });
    t.beat([pictureShow("nova-inner-refused")], 50);
    await until(() => t.events.includes("applied"), "the beat");
    await until(() => t.reports.mock.calls.length > 0, "the warning");
    const canvas = t.layer().images[0].canvas.canvas as HTMLCanvasElement;
    t.playback.speak("nova", [[0, 1]]);
    for (let i = 0; i < 40; i++) {
      t.playback.advance(1 / 60);
      await flushMicrotasks(2);
      expect(t.last(canvas)!.draws.map((draw) => draw.src)).toEqual([BASE, FACE]);
    }
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "kit", file: "nova.svg", reason: "undrawn" });
  });
});

const CHOMP = `morph chomp {
  blend = cut
  keyframes {
    from {
      mouth {
        state = open
      }
    }
    50% {
      mouth {
        state = closed
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
  timing {
    duration = 0.7
    iterations = infinite
    easing = linear
  }
}
`;

const SCRIPT_BODY = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 260 140" width="260" height="140"><path d="M0,100H260V140H0Z" fill="#358"/></svg>`;

const SCRIPT = `${CHOMP}
define kit as layered_image with
  assets = {
    ["body"] = body,
    ["face"] = bunny,
  }
end

scene start
  HERO:
    [[show portrait kit]]
    First line.
end
`;

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

describe("a script's layered image whose SVG file has its own morph (#2873)", () => {
  test("is sent as a morph on one layer of a multi-layer vector picture, and the player draws that layer on a canvas, not a live view", async () => {
    const writes: any[] = [];
    const h = createDOMHarness(SCRIPT, 0, {
      files: [
        { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() },
        { uri: "inmemory:///body.svg", type: "image", name: "body", ext: "svg", data: SCRIPT_BODY },
      ],
      afterEachMessage: (message) => {
        const ops = message?.method === "ui/batch" ? message.params.messages : [message];
        for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
      },
    });
    const playback = MorphPlayback.for(h.overlay);
    playback.configure({
      host: inProcessHost(() => h.game.program),
      seed: "test",
      requestFrame: () => 0,
      cancelFrame: () => {},
      pictureCanvas: () => ({ globalAlpha: 1, imageSmoothingEnabled: true, setTransform: () => {}, clearRect: () => {}, drawImage: () => {} }) as PictureCanvasContext,
      loadPicture: async (src) => ({ image: { src } as never, width: 260, height: 140, vector: { text: "", viewBox: true, src } as never }),
      rasterizeSvgLayer: (source) => Promise.resolve({ image: { src: "pose", text: source.text } as never, release: () => {} }),
    });
    await h.ready;
    await h.preview(SCRIPT.split("\n").findIndex((line) => line.includes("First line.")));
    await flushMicrotasks(10);
    const span = h.overlay.querySelector(".portrait .image > .instance") as HTMLElement;
    const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
    const layer = () => (span as unknown as { __sdMorph?: any }).__sdMorph;
    await until(() => !!shadow()?.querySelector("canvas"), "the picture's canvases");
    for (const [name, value] of [["width", "520px"], ["height", "280px"], ["background-size", "100% 100%"], ["background-repeat", "no-repeat"]]) span.style.setProperty(name!, value!);
    playback.requestRelayout();
    await flushMicrotasks(5);
    await until(() => (layer()?.images[0]?.poses?.sets.length ?? 0) > 0 && !!layer()?.drawn, "the layer's poses");
    const content = writes.find((w) => w.params.target === "portrait" && w.params.instructions[0]?.content?.morph).params.instructions[0].content;
    expect(content.morph.plays.map((play: any) => [play.layer, play.morph, !!play.picture])).toEqual([[1, "chomp", false]]);
    expect(content.pictures.map((picture: any) => [picture.layer, picture.span, picture.vector])).toEqual([[0, 2, true]]);
    expect(shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
    expect(layer().stills[0].canvases.map((view: any) => view.segment.layers)).toEqual([[0, 1]]);
    expect(layer().images[0].poses.sets[0].frames.size).toBeGreaterThan(0);
  });
});
