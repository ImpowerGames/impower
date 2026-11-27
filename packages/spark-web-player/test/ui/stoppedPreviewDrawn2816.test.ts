import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphRecipe, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { blink, talk, talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import type { MorphLayerPlay, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureViewOf } from "../../../spark-dom/src/utils/placePicture";
import UIManager from "../../src/app/managers/UIManager";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../src/app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SOURCE = `layout main {
  stage {
    portrait {
      image
      mask
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
const FILE = "/src/nova.svg";
const ART = talkingPortrait();
const NATURAL = { width: 160, height: 120 };

interface Drawn {
  src: string;
  text?: string;
}

const vector = (src: string): PictureBitmap => ({ image: { src } as never, ...NATURAL, vector: { text: ART, viewBox: true, src } as never });

const speech = (): MorphTiming =>
  ({ trigger: "speech", duration: 0.4, delay: 0, easing: "linear", iterations: 1, direction: "normal" }) as MorphTiming;

const play = (key: string): MorphLayerPlay => ({
  layer: 0,
  ref: { morphs: ["talk"], key, image: "nova", selection: "{}", groups: ["mouth", "eyes"] },
  morph: "talk",
  owner: "nova",
  timing: speech(),
  definition: "d",
});

const SHOW = { $type: "animation", $name: "show", keyframes: [], timing: { delay: 0, duration: 0 } };

const show = (key: string, epoch: number, duration: string | number = 0): WriteImageParams => ({
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
        morph: { plays: [play(key)], epoch },
        enterAnimations: [{ ...SHOW, timing: { delay: 0, duration } } as never],
        previousHideAnimations: [{ ...SHOW, $name: "hide", timing: { delay: 0, duration } } as never],
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

const CUT = { talk: talk({ blend: "cut", clips: [] }), blink: blink({ blend: "cut", clips: [] }) };

async function setup(options: { load?: (src: string) => Promise<PictureBitmap> } = {}) {
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
  sheet.textContent = `.image > .instance, .mask > .instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; }`;
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
  const rasterized: string[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    host: createMorphHost({
      service: new MorphBakeService(),
      channel: () => ({ recipes: Object.fromEntries(Object.entries(CUT as Record<string, MorphRecipe>).map(([name, recipe]) => [name, serializeMorphRecipe(recipe)])), variants: {} }),
      readSource: async () => ({ text: ART }),
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
    loadPicture: options.load ?? (async (src) => vector(src)),
    rasterizeSvgLayer: (source, _natural, w, hgt) => {
      const src = (source as unknown as { src?: string }).src;
      rasterized.push(src ? `rest ${w}x${hgt}` : `pose ${w}x${hgt}`);
      events.push(src ? "rest" : "pose");
      return Promise.resolve({ image: (src ? { src } : { src: `pose ${rasterized.length}`, text: source.text }) as never, release: vi.fn() });
    },
  });
  playback.placeholders = true;
  const reports = vi.fn();
  playback.reportStill = reports;
  const app = (h.ui as unknown as { app: { previewing?: boolean } }).app;
  app.previewing = true;
  playback.setEnabled(false);
  let ui: UIManager = h.ui;
  const watch = (manager: UIManager) => {
    const target = manager as unknown as { applyBeat: (...args: unknown[]) => void };
    const apply = target.applyBeat.bind(manager);
    target.applyBeat = (...args: unknown[]) => {
      events.push("applied");
      apply(...args);
    };
  };
  watch(ui);
  let id = 0;
  const request = (method: string, params: unknown) => ({ jsonrpc: "2.0", id: `${method}-${++id}`, method, params });
  const beat = (writes: (WriteImageParams | { method: string; params: unknown })[], line = 20) => {
    ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "ui/beat",
      params: {
        messages: writes.map((entry) => ("method" in entry ? request(entry.method, entry.params) : request("ui/write-image", entry))),
        source: { uri: "file:///main.sd", range: { start: { line, character: 0 }, end: { line, character: 1 } } },
      },
    } as never);
  };
  const contentOf = (name: "image" | "mask") => h.overlay.querySelector(`.portrait > .${name}`) as HTMLElement;
  const pictureOf = (name: "image" | "mask") =>
    Array.from(contentOf(name).children).find((el) => (el as { __sdMorph?: unknown }).__sdMorph) as (HTMLElement & { __sdMorph?: any }) | undefined;
  const clear: WriteImageParams = { target: "portrait", instant: false, instructions: [] };
  const fresh = async () => {
    ui.onDispose();
    ui = new UIManager(app as never);
    watch(ui);
    await ui.onInit();
  };
  const switchGame = async (epoch: number, restored: "cleared" | "shown") => {
    await fresh();
    for (const name of ["image", "mask"] as const) {
      const parent = (contentOf(name) as { __sdId?: string }).__sdId!;
      await ui.onReceiveRequest(request("ui/create", { parent, element: `${parent}-instance-0`, type: "span", name: "instance" }) as never);
    }
    await ui.onReceiveRequest(request("ui/write-image", restored === "cleared" ? clear : show("nova-run", epoch)) as never);
    beat(restored === "cleared" ? [show("nova-run", epoch)] : [clear, show("nova-run", epoch)], 30);
    await untilShown(h.overlay);
    await new Promise((resolve) => setTimeout(resolve, 100));
    await flushMicrotasks(10);
  };
  cleanup = () => {
    ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return { h, ui: () => ui, events, paints, rasterized, reports, beat, playback, pictureOf, switchGame, fresh };
}

describe("the stopped preview shows a drawn picture from the same drawing as play (#2816)", () => {
  test("a drawn portrait written while the preview is stopped is shown from its rest-pose canvas, with no inline SVG and no CSS background of its files", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await flushMicrotasks(10);
    expect(t.playback.animating).toBe(false);
    expect(t.events.indexOf("rest")).toBeLessThan(t.events.indexOf("applied"));
    const span = t.pictureOf("image")!;
    const root = span.querySelector(":scope > .morph")!.shadowRoot!;
    expect(root.querySelectorAll("canvas")).toHaveLength(1);
    expect(root.querySelector("svg")).toBeNull();
    expect(span.style.getPropertyValue("background-image")).not.toContain(FILE);
    const canvas = root.querySelector("canvas");
    expect(t.paints.some((paint) => paint.canvas === canvas && paint.draws.some((drawn) => drawn.src === FILE))).toBe(true);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("starting and stopping play with the same picture on screen keeps its canvas and paints it no further time", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    const shadow = t.pictureOf("mask")!;
    const canvas = picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas");
    expect(canvas).not.toBeNull();
    const painted = t.paints.length;
    const drawn = t.rasterized.length;

    t.playback.setPlaying(true);
    await t.switchGame(1, "cleared");
    expect(t.pictureOf("image")).toBe(picture);
    expect(t.pictureOf("mask")).toBe(shadow);
    expect(picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas")).toBe(canvas);
    expect(t.rasterized.length).toBe(drawn);
    expect(t.paints.length).toBe(painted);

    t.playback.setPlaying(false);
    await t.switchGame(2, "shown");
    expect(t.pictureOf("image")).toBe(picture);
    expect(t.pictureOf("mask")).toBe(shadow);
    expect(picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas")).toBe(canvas);
    expect(t.rasterized.length).toBe(drawn);
    expect(t.paints.length).toBe(painted);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("a new game's clear before its first beat keeps the picture on screen until that beat, which takes it away when it does not show it", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-1", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    expect(t.pictureOf("image")).toBe(picture);
    expect(picture.isConnected).toBe(true);
    t.beat([], 40);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the next beat");
    await flushMicrotasks(10);
    expect(picture.isConnected).toBe(false);
    expect(t.pictureOf("image")).toBeUndefined();
    expect(t.pictureOf("mask")).toBeUndefined();
  });

  test("a new game replaced before its first beat leaves the inherited picture for the next game to keep", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    const canvas = picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas");
    const painted = t.paints.length;
    await t.fresh();
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-5", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    expect(picture.isConnected).toBe(true);
    await t.switchGame(2, "cleared");
    expect(t.pictureOf("image")).toBe(picture);
    expect(picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas")).toBe(canvas);
    expect(t.paints.length).toBe(painted);
  });

  test("a show of the same picture whose instant entrance ends in a different state replaces it", async () => {
    const t = await setup();
    const faded = (key: string, opacity: string): WriteImageParams => {
      const write = show(key, 0);
      const content = write.instructions[0]!.content!;
      content.enterAnimations = [{ ...(content.enterAnimations![0] as object), keyframes: [{ opacity }], timing: { delay: 0, duration: 0, fill: "forwards" } } as never];
      return write;
    };
    t.beat([faded("nova-run", "0.2")]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    t.beat([faded("nova-run", "1")], 31);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the second beat");
    await untilShown(t.h.overlay);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.pictureOf("image")).toBeDefined();
    expect(t.pictureOf("image")).not.toBe(picture);
  });

  test("a kept picture written with a new morph epoch restarts its morph from the start", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    const layer = picture.__sdMorph;
    expect(layer.occurrenceKeys.every((key: string) => key.endsWith("|0"))).toBe(true);
    const before = layer.occurrenceKeys.length;
    t.playback.advance(0.2);
    t.beat([{ target: "portrait", instant: false, instructions: [] }, show("nova-run", 1)], 31);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the second beat");
    await flushMicrotasks(10);
    expect(t.pictureOf("image")).toBe(picture);
    expect(picture.__sdMorph).toBe(layer);
    expect(layer.occurrenceKeys).toHaveLength(before);
    expect(layer.occurrenceKeys.every((key: string) => key.endsWith("|1"))).toBe(true);
    const occurrences = (t.playback as unknown as { occurrences: Map<string, { start: number }> }).occurrences;
    expect(layer.occurrenceKeys.every((key: string) => occurrences.get(key)!.start === t.playback.now)).toBe(true);
  });

  test("a new game that writes the shown picture unchanged owns it, so its own later clear takes it away at once", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "same-1", method: "ui/write-image", params: show("nova-run", 0) } as never);
    expect(t.pictureOf("image")).toBe(picture);
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-4", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    expect(picture.isConnected).toBe(false);
    expect(t.pictureOf("image")).toBeUndefined();
  });

  test("a new game's held clear takes the picture away when no beat follows within the drawing timeouts", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    t.ui().onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.1, restoreTimeout: 0.05 },
    } as never);
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-3", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    expect(picture.isConnected).toBe(true);
    await until(() => !picture.isConnected, "the held clear to settle");
    expect(t.pictureOf("image")).toBeUndefined();
    expect(t.pictureOf("mask")).toBeUndefined();
  });

  test("with a drawing timeout turned off, a new game's held clear waits for its first beat however long it takes", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    const canvas = picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas");
    await t.fresh();
    t.ui().onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0, restoreTimeout: 0 },
    } as never);
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-6", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(picture.isConnected).toBe(true);
    t.beat([show("nova-run", 1)], 32);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the first beat");
    await flushMicrotasks(10);
    expect(t.pictureOf("image")).toBe(picture);
    expect(picture.querySelector(":scope > .morph")!.shadowRoot!.querySelector("canvas")).toBe(canvas);
  });

  test("a new game's held clear stays until its first beat applies, even when that beat arrives and is still drawing at the fallback time", async () => {
    const OTHER = "/src/other.svg";
    const t = await setup({ load: (src) => (src === OTHER ? new Promise<PictureBitmap>(() => {}) : Promise.resolve(vector(src))) });
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    t.ui().onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.4, restoreTimeout: 0.4 },
    } as never);
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-7", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const other = show("other-run", 1);
    const content = other.instructions[0]!.content!;
    content.background = `url("${OTHER}")`;
    content.imageNames = "other";
    content.srcs = [OTHER];
    content.pictures = [{ layer: 0, span: 1, name: "other", vector: true, files: [{ src: OTHER, name: "other.svg" }] }];
    content.morph = undefined;
    t.beat([other], 33);
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(t.events.filter((event) => event === "applied")).toHaveLength(1);
    expect(picture.isConnected).toBe(true);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the first beat after its drawing wait");
    await flushMicrotasks(10);
    expect(picture.isConnected).toBe(false);
  });

  test("a clear whose exit the game awaits, sent after a new game's held clear, takes the held picture away at once", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-8", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    expect(picture.isConnected).toBe(true);
    await t.ui().onReceiveRequest({
      jsonrpc: "2.0",
      id: "clear-9",
      method: "ui/write-image",
      params: { target: "portrait", instant: false, instructions: [], reportsExit: true },
    } as never);
    expect(picture.isConnected).toBe(false);
    expect(t.pictureOf("image")).toBeUndefined();
    expect(t.pictureOf("mask")).toBeUndefined();
  });

  test("a clear outside a beat once the game has applied a beat takes the picture away at once", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.ui().onReceiveRequest({ jsonrpc: "2.0", id: "clear-2", method: "ui/write-image", params: { target: "portrait", instant: false, instructions: [] } } as never);
    await flushMicrotasks(10);
    expect(picture.isConnected).toBe(false);
    expect(t.pictureOf("image")).toBeUndefined();
    expect(t.pictureOf("mask")).toBeUndefined();
  });

  test("a new game's clear before its first beat whose exit the game waits for takes the picture away at once", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    await t.fresh();
    await t.ui().onReceiveRequest({
      jsonrpc: "2.0",
      id: "clear-exit-1",
      method: "ui/write-image",
      params: { target: "portrait", instant: false, instructions: [], reportsExit: true },
    } as never);
    expect(picture.isConnected).toBe(false);
    expect(t.pictureOf("image")).toBeUndefined();
  });

  test("a beat that creates an element, clears it and shows a picture in it applies with the picture shown", async () => {
    const t = await setup();
    const stage = (t.h.overlay.querySelector(".stage") as { __sdId?: string }).__sdId!;
    const made = { ...show("nova-made", 0), target: "extra", elements: ["e-made"] };
    t.beat([
      { method: "ui/create", params: { parent: stage, element: "e-made", type: "div", name: "extra" } },
      { method: "ui/create", params: { parent: "e-made", element: "e-made-image", type: "div", name: "image" } },
      { ...made, instructions: [] },
      made,
    ]);
    await until(() => t.events.includes("applied"), "the beat");
    await untilShown(t.h.overlay);
    const content = t.h.overlay.querySelector(".extra > .image")!;
    expect(Array.from(content.children).some((el) => (el as { __sdMorph?: unknown }).__sdMorph)).toBe(true);
  });

  test("a show of the same picture that plays an enter animation replaces it as before", async () => {
    const t = await setup();
    t.beat([show("nova-run", 0)]);
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 100));
    const picture = t.pictureOf("image")!;
    t.beat([show("nova-run", 0, "0.2s")], 31);
    await untilShown(t.h.overlay);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.pictureOf("image")).toBeDefined();
    expect(t.pictureOf("image")).not.toBe(picture);
  });

  test("in the stopped preview a picture not drawn within `restore_timeout` shows the placeholder, and its drawing replaces it when it lands", async () => {
    let finish: (() => void) | undefined;
    const t = await setup({ load: (src) => new Promise((resolve) => (finish = () => resolve(vector(src)))) });
    t.ui().onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 8, restoreTimeout: 0.05 },
    } as never);
    t.beat([show("nova-late", 0)]);
    await until(() => t.events.includes("applied"), "the beat after `restore_timeout`");
    const root = () => t.pictureOf("image")?.querySelector(":scope > .morph")?.shadowRoot;
    expect(root()?.querySelector("[data-undrawn]")?.getAttribute("data-undrawn")).toBe("late");
    expect(t.reports).toHaveBeenCalledWith({ image: "nova", file: "nova.svg", reason: "late", placeholder: true });
    finish!();
    await until(() => !!root()?.querySelector("canvas") && !root()?.querySelector("[data-undrawn]"), "the drawing");
    expect(root()!.querySelector("svg")).toBeNull();
    expect(t.reports).toHaveBeenCalledTimes(1);
  });
});
