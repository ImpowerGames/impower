import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphImageContent } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import type { LayeredPicture, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import type { Animation } from "@impower/spark-engine/src/game/modules/ui/types/Animation";
import { pictureViewOf } from "../../../../spark-dom/src/utils/placePicture";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import type { SvgLayerRaster } from "../../app/morph/svgLayerFile";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SOURCE = `layout main {
  stage {
    backdrop {
      image
    }
    sigil {
      image
    }
    badge {
      image
    }
  }
  textbox {
    dialogue {
      text
    }
    action {
      text
    }
  }
}

scene start
  Nothing yet.
end
`;

const BOX = { width: 400, height: 225 };
const STYLE_SCALE = 1.5;
const DPR = 2;

const SVG = { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"/>', viewBox: true };

const vector = (src: string): PictureBitmap => ({ image: { src } as never, width: 160, height: 90, vector: { ...SVG, src } as never });
const bitmap = (src: string): PictureBitmap => ({ image: { src } as never, width: 160, height: 90 });

const picture = (name: string, srcs: string[], vectorPicture = true): LayeredPicture => ({
  layer: 0,
  span: srcs.length,
  name,
  ...(vectorPicture ? { vector: true as const } : {}),
  files: srcs.map((src) => ({ src, name: src.slice(src.lastIndexOf("/") + 1) })),
});

const show = (
  target: string,
  name: string,
  srcs: string[],
  options: { framing?: { x: number; y: number; zoom: number }; enter?: Animation; vector?: boolean } = {},
): WriteImageParams => ({
  target,
  instant: false,
  instructions: [
    {
      control: "show",
      ...(options.framing ? { framing: options.framing } : {}),
      content: {
        background: [...srcs].reverse().map((src) => `url("${src}")`).join(", "),
        imageNames: name,
        srcs,
        pictures: [picture(name, srcs, options.vector ?? true)],
        ...(options.enter ? { enterAnimation: options.enter } : {}),
      },
    },
  ],
});

const grow: Animation = {
  $type: "animation",
  $name: "grow",
  target: { $type: "layer", $name: "self" },
  keyframes: [{ scale: "1" }, { scale: "1.25" }],
  timing: { duration: "0.4s" },
} as unknown as Animation;

interface Deferred {
  width: number;
  height: number;
  src: string;
  resolve: (raster: SvgLayerRaster | undefined) => void;
}

const raster = (src: string, width: number, height: number): SvgLayerRaster => ({ image: { src: `raster ${src} ${width}x${height}` } as never, release: vi.fn() });

let cleanup: (() => void) | undefined;

const clearBeatEntries = () => {
  for (const entry of [...performance.getEntriesByType("mark"), ...performance.getEntriesByType("measure")]) {
    if (entry.name.startsWith("beat ")) {
      performance.clearMarks(entry.name);
      performance.clearMeasures(entry.name);
    }
  }
};

beforeEach(clearBeatEntries);

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
  clearBeatEntries();
});

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function setup(
  options: {
    placeholders?: boolean;
    holdRasters?: boolean;
    refuse?: (src: string) => boolean;
    load?: (src: string) => Promise<PictureBitmap | undefined>;
    stretch?: { x: number; y: number };
  } = {},
) {
  const stretch = options.stretch ?? { x: STYLE_SCALE, y: STYLE_SCALE };
  const h = createDOMHarness(SOURCE, 0, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, 0);
  await untilShown(h.overlay);
  const win = h.overlay.ownerDocument.defaultView as Window & typeof globalThis;
  const effect = (win as unknown as { KeyframeEffect: { prototype: Record<string, unknown> } }).KeyframeEffect.prototype;
  effect["getTiming"] ??= () => ({ delay: 0, duration: 0 });
  effect["getComputedTiming"] ??= () => ({ progress: 0, endTime: 0 });
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, value: DPR });
  const sheet = win.document.createElement("style");
  sheet.textContent = `.instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; } [style*="display: none"] .instance { width: auto !important; height: auto !important; } .sigil.wide .instance { width: 800px !important; height: 450px !important; } .sigil.half .instance { background-size: 50% 50% !important; } .plaque.wide .instance { width: 800px !important; height: 450px !important; }`;
  win.document.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const laidOut = (el: HTMLElement) => {
    for (let at: HTMLElement | null = el; at; at = at.parentElement) if (at.style.getPropertyValue("display") === "none") return false;
    return el.classList.contains("instance");
  };
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return laidOut(this) ? BOX.width : 0;
    },
  });
  const height = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
  Object.defineProperty(proto, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return laidOut(this) ? BOX.height : 0;
    },
  });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const zoom = laidOut(this) ? pictureViewOf(this).zoom : 0;
      const across = BOX.width * stretch.x * zoom;
      const down = BOX.height * stretch.y * zoom;
      return { x: 0, y: 0, left: 0, top: 0, right: across, bottom: down, width: across, height: down, toJSON() {} };
    },
  });
  const events: string[] = [];
  const paints: { canvas: HTMLCanvasElement; width: number; height: number; draws: string[]; at: number }[] = [];
  const rasters: Deferred[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    pictureCanvas: (canvas) => {
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          paints.push({ canvas, width: canvas.width, height: canvas.height, draws: [], at: performance.now() });
          events.push(`paint ${canvas.width}x${canvas.height}`);
        },
        drawImage(image, _x, _y, w, h) {
          paints.at(-1)?.draws.push(`${(image as unknown as { src: string }).src} @${w}x${h}`);
        },
      };
      return context;
    },
    loadPicture: options.load ?? (async (src) => (src.endsWith(".svg") ? vector(src) : bitmap(src))),
    rasterizeSvgLayer: (source, _natural, w, h) => {
      const src = (source as unknown as { src?: string }).src ?? "svg";
      if (options.refuse?.(src)) return Promise.resolve(undefined);
      if (!options.holdRasters) return Promise.resolve(raster(src, w, h));
      return new Promise((resolve) => rasters.push({ width: w, height: h, src, resolve }));
    },
  });
  playback.placeholders = options.placeholders ?? true;
  const reports = vi.fn();
  playback.reportStill = reports;
  const ui = h.ui as unknown as { applyBeat: (...args: unknown[]) => void };
  const apply = ui.applyBeat.bind(h.ui);
  ui.applyBeat = (...args: unknown[]) => {
    events.push("applied");
    apply(...args);
  };
  let id = 0;
  const beat = (writes: WriteImageParams[], line = 20, before: { method: string; params: unknown }[] = []) => {
    h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "ui/beat",
      params: {
        messages: [
          ...before.map((message) => ({ jsonrpc: "2.0", id: `op-${++id}`, ...message })),
          ...writes.map((params) => ({ jsonrpc: "2.0", id: `write-${++id}`, method: "ui/write-image", params })),
        ],
        source: { uri: "file:///main.sd", range: { start: { line, character: 0 }, end: { line, character: 1 } } },
      },
    } as never);
  };
  const spanOf = (target: string) => (Array.from(h.overlay.querySelectorAll(`.${target} > .image > .instance`)) as HTMLElement[]).at(-1);
  const shadowOf = (target: string) => spanOf(target)?.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const pending = () => (h.overlay as HTMLElement & { __sdBeat?: unknown }).__sdBeat !== undefined;
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return { h, win, events, paints, rasters, reports, beat, spanOf, shadowOf, pending, playback };
}

const marks = (line: number) =>
  Object.fromEntries(
    performance
      .getEntriesByType("mark")
      .filter((entry) => entry.name.includes(`main.sd:${line + 1} #`))
      .map((entry) => [entry.name.split(" ")[1], entry.startTime]),
  );

describe("a vector picture's rest pose is drawn on a canvas before its beat fires (#2810)", () => {
  test("it is painted once before the beat is applied, at its box, pixel ratio, framing at both ends of a move, style scale and scale keyframes, and not again when the move starts", async () => {
    const t = await setup();
    const lift = { ...grow, $name: "lift", keyframes: [{ transform: "scale(1)" }, { transform: "scale(1.2, 1.1)" }] } as unknown as Animation;
    t.beat([
      {
        ...show("backdrop", "dusk", ["/src/dusk.svg"], { framing: { x: 0.5, y: 0.5, zoom: 2 }, enter: grow }),
        instructions: [
          { ...show("backdrop", "dusk", ["/src/dusk.svg"], { framing: { x: 0.5, y: 0.5, zoom: 2 }, enter: grow }).instructions[0]!, targetAnimations: [lift] },
          { control: "animate", travel: { framing: { x: 0.5, y: 0.5, zoom: 3 }, timing: { delay: "0s", duration: "2s", easing: "linear" } } },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat");
    const width = Math.round(BOX.width * DPR * 3 * STYLE_SCALE * 1.25 * 1.2);
    const height = Math.round(BOX.height * DPR * 3 * STYLE_SCALE * 1.25 * 1.2);
    expect(t.events).toEqual([`paint ${width}x${height}`, "applied"]);
    expect(t.paints[0]!.draws).toEqual([`raster /src/dusk.svg ${width}x${height} @${width}x${height}`]);
    const span = t.spanOf("backdrop")!;
    expect(span.style.getPropertyValue("visibility")).toBe("");
    expect(span.style.getPropertyValue("background-image")).toBe("none");
    expect(t.shadowOf("backdrop")!.querySelectorAll("canvas")).toHaveLength(1);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.events).toEqual([`paint ${width}x${height}`, "applied"]);
  });

  test("the beat is applied only after every canvas it shows is painted, and its ready mark follows the last paint", async () => {
    const waiting = new Map<string, (value: PictureBitmap) => void>();
    const t = await setup({
      holdRasters: true,
      load: (src) => (src.endsWith(".png") ? new Promise((resolve) => waiting.set(src, resolve)) : Promise.resolve(vector(src))),
    });
    t.beat(
      [
        show("backdrop", "dusk", ["/src/dusk.svg"]),
        show("sigil", "emblem", ["/src/emblem.svg"]),
        show("badge", "hall", ["/src/hall sky.png", "/src/hall towers.png"], { vector: false }),
      ],
      30,
    );
    await until(() => t.rasters.length === 2, "both rasters to be asked for");
    expect(t.pending()).toBe(true);
    t.rasters[0]!.resolve(raster(t.rasters[0]!.src, t.rasters[0]!.width, t.rasters[0]!.height));
    await flushMicrotasks(10);
    t.rasters[1]!.resolve(raster(t.rasters[1]!.src, t.rasters[1]!.width, t.rasters[1]!.height));
    await flushMicrotasks(10);
    expect(t.events.filter((event) => event.startsWith("paint"))).toHaveLength(2);
    expect(t.events).not.toContain("applied");
    expect(t.pending()).toBe(true);
    expect(marks(30)["ready"]).toBeUndefined();
    await until(() => waiting.size === 2, "the bitmap layer loads");
    for (const [src, resolve] of waiting) resolve(bitmap(src));
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.events.at(-1)).toBe("applied");
    expect(t.events.filter((event) => event.startsWith("paint"))).toHaveLength(3);
    const entries = marks(30);
    expect(entries["ready"]).toBeGreaterThanOrEqual(Math.max(...t.paints.map((paint) => paint.at)));
    expect(entries["fired"]).toBeGreaterThanOrEqual(entries["ready"]!);
  });
});

describe("the beat's drawing barrier holds against what follows it, and sizes from the beat's own layout (#2810)", () => {
  test("a beat that arrives while an earlier beat waits for its drawing waits behind it, and each fires only once drawn", async () => {
    const t = await setup({ holdRasters: true });
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])], 50);
    await until(() => t.rasters.length === 1, "the first raster");
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 52);
    await flushMicrotasks(20);
    expect(t.events).toEqual([]);
    expect(marks(52)["received"]).toBeDefined();
    const first = t.rasters[0]!;
    first.resolve(raster(first.src, first.width, first.height));
    await until(() => t.rasters.length === 2, "the second beat's raster");
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied"]);
    expect(t.spanOf("sigil")?.style.getPropertyValue("visibility")).toBe("hidden");
    const second = t.rasters[1]!;
    second.resolve(raster(second.src, second.width, second.height));
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the second beat");
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied", `paint ${second.width}x${second.height}`, "applied"]);
  });

  test("a beat that arrives while an earlier beat waits for the picture of an element it creates waits too", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 54, [
      { method: "ui/create", params: { parent: stage.__sdId, element: "made-plaque", type: "div", name: "plaque", breakpoints: {} } },
      { method: "ui/create", params: { parent: "made-plaque", element: "made-plaque-image", type: "div", name: "image", breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 1, "the first beat's raster");
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])], 56);
    await flushMicrotasks(20);
    const plaque = t.h.overlay.querySelector(".plaque") as HTMLElement;
    expect(plaque.style.getPropertyValue("visibility")).toBe("hidden");
    expect(t.events).toEqual([]);
    const asked = t.rasters[0]!;
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => t.events.includes("applied"), "the first beat");
    expect(plaque.style.getPropertyValue("visibility")).toBe("");
    await until(() => t.rasters.length === 2, "the second beat's raster");
  });

  test("a beat that changes the target's picture styles before its write draws the picture with the new styles before it fires, and not again after", async () => {
    const t = await setup({ holdRasters: true });
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    sigil.className = "sigil half";
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 64, [{ method: "ui/update", params: { element: sigil.__sdId, attributes: { class: "sigil" }, breakpoints: {} } }]);
    await until(() => t.rasters.length === 1, "the raster");
    const asked = t.rasters[0]!;
    expect([asked.width, asked.height]).toEqual([Math.round(BOX.width * DPR * STYLE_SCALE), Math.round(BOX.height * DPR * STYLE_SCALE)]);
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => t.events.includes("applied"), "the beat");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.events).toEqual([`paint ${asked.width}x${asked.height}`, "applied"]);
    expect(t.rasters).toHaveLength(1);
  });

  test("a style that magnifies the picture more in one direction draws it at the larger magnification", async () => {
    const t = await setup({ stretch: { x: 1, y: 2 } });
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])], 66);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.events).toEqual([`paint ${BOX.width * DPR * 2}x${BOX.height * DPR * 2}`, "applied"]);
  });

  test("a UI message that arrives while a beat waits for its drawing applies it with its undrawn picture marked late, never as drawn", async () => {
    const t = await setup({ holdRasters: true, placeholders: true });
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])], 58);
    await until(() => t.rasters.length === 1, "the raster");
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    await t.h.ui.onReceiveRequest({ jsonrpc: "2.0", id: "lone-update", method: "ui/update", params: { element: sigil.__sdId, style: { opacity: "0.5" }, breakpoints: {} } } as never);
    expect(t.events).toEqual(["applied"]);
    expect(t.shadowOf("backdrop")!.querySelector("[data-undrawn]")?.getAttribute("data-undrawn")).toBe("late");
    expect(t.reports).toHaveBeenCalledWith({ image: "dusk", file: "dusk.svg", reason: "late", placeholder: true });
  });

  test("a beat that widens the target before its write prepares the picture at the new size and paints it once", async () => {
    const t = await setup({ holdRasters: true });
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 60, [{ method: "ui/update", params: { element: sigil.__sdId, attributes: { class: "sigil wide" }, breakpoints: {} } }]);
    await until(() => t.rasters.length === 1, "the raster");
    expect(sigil.className).toBe("sigil");
    const asked = t.rasters[0]!;
    expect([asked.width, asked.height]).toEqual([Math.round(800 * DPR * STYLE_SCALE), Math.round(450 * DPR * STYLE_SCALE)]);
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => t.events.includes("applied"), "the beat");
    expect(sigil.className).toBe("sigil wide");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.events).toEqual([`paint ${asked.width}x${asked.height}`, "applied"]);
  });

  test("scale functions in one keyframe compose", async () => {
    const t = await setup();
    const twice = { ...grow, $name: "twice", keyframes: [{ transform: "scale(1)" }, { transform: "scale(2) scale(1.5)", scale: "1.1" }] } as unknown as Animation;
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"], { enter: twice })], 62);
    await until(() => t.events.includes("applied"), "the beat");
    const width = Math.round(BOX.width * DPR * STYLE_SCALE * 3.3);
    const height = Math.round(BOX.height * DPR * STYLE_SCALE * 3.3);
    expect(t.events).toEqual([`paint ${width}x${height}`, "applied"]);
  });
});

const plaque = (stage: string, style?: Record<string, string>) => [
  { method: "ui/create", params: { parent: stage, element: "made-plaque", type: "div", name: "plaque", ...(style ? { style } : {}), breakpoints: {} } },
  { method: "ui/create", params: { parent: "made-plaque", element: "made-plaque-image", type: "div", name: "image", breakpoints: {} } },
];

describe("a beat's created targets are made, measured and shown with the beat (#2810)", () => {
  test("a write to an existing target and one the beat creates waits for both pictures", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 70, [
      { method: "ui/create", params: { parent: stage.__sdId, element: "made-sigil", type: "div", name: "sigil", breakpoints: {} } },
      { method: "ui/create", params: { parent: "made-sigil", element: "made-sigil-image", type: "div", name: "image", breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 2, "both rasters");
    t.rasters[0]!.resolve(raster(t.rasters[0]!.src, t.rasters[0]!.width, t.rasters[0]!.height));
    await flushMicrotasks(20);
    expect(t.events.includes("applied")).toBe(false);
    t.rasters[1]!.resolve(raster(t.rasters[1]!.src, t.rasters[1]!.width, t.rasters[1]!.height));
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.events.at(-1)).toBe("applied");
  });

  test("a target made for a beat that is torn down before it fires is shown again, not left hidden", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 72, plaque(stage.__sdId!));
    await until(() => t.rasters.length === 1, "the raster");
    const made = t.h.overlay.querySelector(".plaque") as HTMLElement;
    expect(made.style.getPropertyValue("visibility")).toBe("hidden");
    t.h.ui.onDispose();
    expect(made.style.getPropertyValue("visibility")).toBe("");
  });

  test("a target the beat makes hidden in its own style stays hidden once the beat fires", async () => {
    const t = await setup();
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 74, plaque(stage.__sdId!, { visibility: "hidden" }));
    await until(() => t.events.includes("applied"), "the beat");
    expect((t.h.overlay.querySelector(".plaque") as HTMLElement).style.getPropertyValue("visibility")).toBe("hidden");
  });

  test("a beat that repeats an existing element's create and creates a picture target under it hides only the new target", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    const holder = { method: "ui/create", params: { parent: stage.__sdId, element: "made-holder", type: "div", name: "holder", breakpoints: {} } };
    await t.h.ui.onReceiveRequest({ jsonrpc: "2.0", id: "holder", ...holder } as never);
    const made = t.h.overlay.querySelector(".holder") as HTMLElement;
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 98, [
      holder,
      { method: "ui/create", params: { parent: "made-holder", element: "made-plaque", type: "div", name: "plaque", breakpoints: {} } },
      { method: "ui/create", params: { parent: "made-plaque", element: "made-plaque-image", type: "div", name: "image", breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 1, "the raster");
    expect(t.events).toEqual([]);
    expect(made.style.getPropertyValue("visibility")).toBe("");
    expect((t.h.overlay.querySelector(".plaque") as HTMLElement).style.getPropertyValue("visibility")).toBe("hidden");
  });

  test("a beat that creates the image element of an existing target waits for the picture written there", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    await t.h.ui.onReceiveRequest({
      jsonrpc: "2.0",
      id: "bare",
      method: "ui/create",
      params: { parent: stage.__sdId, element: "made-bare", type: "div", name: "bare", breakpoints: {} },
    } as never);
    t.beat([show("bare", "emblem", ["/src/emblem.svg"])], 100, [
      { method: "ui/create", params: { parent: "made-bare", element: "made-bare-image", type: "div", name: "image", breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 1, "the raster");
    await flushMicrotasks(20);
    expect(t.events).toEqual([]);
    expect(t.pending()).toBe(true);
    const asked = t.rasters[0]!;
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.events).toEqual([`paint ${asked.width}x${asked.height}`, "applied"]);
    expect((t.h.overlay.querySelector(".bare > .image") as HTMLElement).style.getPropertyValue("visibility")).toBe("");
  });

  test("a target the beat makes and then widens is drawn at its widened size", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 76, [
      ...plaque(stage.__sdId!),
      { method: "ui/update", params: { element: "made-plaque", attributes: { class: "plaque wide" }, breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 1, "the raster");
    expect([t.rasters[0]!.width, t.rasters[0]!.height]).toEqual([Math.round(800 * DPR * STYLE_SCALE), Math.round(450 * DPR * STYLE_SCALE)]);
  });

  test("a target the beat makes and then scales up is drawn at its scaled size", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    const double = { ...grow, $name: "double", keyframes: [{ scale: "1" }, { scale: "2" }] } as unknown as Animation;
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 78, [
      ...plaque(stage.__sdId!),
      { method: "ui/animate", params: { effects: [{ element: "made-plaque", animations: [double] }] } },
    ]);
    await until(() => t.rasters.length === 1, "the raster");
    expect([t.rasters[0]!.width, t.rasters[0]!.height]).toEqual([Math.round(BOX.width * DPR * STYLE_SCALE * 2), Math.round(BOX.height * DPR * STYLE_SCALE * 2)]);
  });
});

const shown = async (t: Awaited<ReturnType<typeof setup>>, line: number) => {
  t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], line);
  await until(() => t.rasters.length === 1, "the first raster");
  const first = t.rasters[0]!;
  first.resolve(raster(first.src, first.width, first.height));
  await until(() => t.events.includes("applied"), "the first beat");
  await new Promise((resolve) => setTimeout(resolve, 50));
  return { first, canvas: t.shadowOf("sigil")!.querySelector("canvas")! };
};

describe("a later beat that redraws a shown picture keeps it shown until the new drawing is ready (#2810)", () => {
  test("a beat that zooms a shown picture keeps its drawing on the canvas until the larger drawing is painted, then fires", async () => {
    const t = await setup({ holdRasters: true });
    const { first, canvas } = await shown(t, 90);
    t.beat(
      [
        {
          target: "sigil",
          instant: false,
          instructions: [{ control: "animate", travel: { framing: { x: 0.5, y: 0.5, zoom: 2 }, timing: { delay: "0s", duration: "1s", easing: "linear" } } }],
        } as never,
      ],
      92,
    );
    await until(() => t.rasters.length === 2, "the zoomed raster");
    await flushMicrotasks(20);
    const second = t.rasters[1]!;
    expect([second.width, second.height]).toEqual([first.width * 2, first.height * 2]);
    expect([canvas.width, canvas.height]).toEqual([first.width, first.height]);
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied"]);
    second.resolve(raster(second.src, second.width, second.height));
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the zooming beat");
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied", `paint ${second.width}x${second.height}`, "applied"]);
    expect([canvas.width, canvas.height]).toEqual([second.width, second.height]);
  });

  test("a beat that widens a shown picture's target draws it at the new size before it fires, and shows it at that size as it fires", async () => {
    const t = await setup({ holdRasters: true });
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    const { first, canvas } = await shown(t, 94);
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 96, [{ method: "ui/update", params: { element: sigil.__sdId, attributes: { class: "sigil wide" }, breakpoints: {} } }]);
    await until(() => t.rasters.length === 2, "the wider raster");
    await flushMicrotasks(20);
    const second = t.rasters[1]!;
    expect([second.width, second.height]).toEqual([Math.round(800 * DPR * STYLE_SCALE), Math.round(450 * DPR * STYLE_SCALE)]);
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied"]);
    expect(sigil.className).toBe("sigil");
    expect([canvas.width, canvas.height]).toEqual([first.width, first.height]);
    second.resolve(raster(second.src, second.width, second.height));
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the widening beat");
    expect(sigil.className).toBe("sigil wide");
    expect(t.events).toEqual([`paint ${first.width}x${first.height}`, "applied", "applied", `paint ${second.width}x${second.height}`]);
    expect([canvas.width, canvas.height]).toEqual([second.width, second.height]);
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.rasters).toHaveLength(2);
    expect(t.events.filter((event) => event.startsWith("paint"))).toHaveLength(2);
  });
});

describe("a vector picture in an element the beat reveals or creates (#2810)", () => {
  test("in an element the beat reveals, it is drawn before the beat at the size its span has once shown, the element stays hidden until the beat, and nothing is painted again once it shows", async () => {
    const t = await setup({ holdRasters: true });
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    sigil.style.setProperty("display", "none");
    t.beat([show("sigil", "emblem", ["/src/emblem.svg"])], 20, [{ method: "ui/update", params: { element: sigil.__sdId, style: { display: null }, breakpoints: {} } }]);
    const width = Math.round(BOX.width * DPR * STYLE_SCALE);
    const height = Math.round(BOX.height * DPR * STYLE_SCALE);
    await until(() => t.rasters.length === 1, "the raster to be asked for");
    expect(t.rasters[0]!.width).toBe(width);
    expect(sigil.style.getPropertyValue("display")).toBe("none");
    expect(t.events).toEqual([]);
    t.rasters[0]!.resolve(raster(t.rasters[0]!.src, width, height));
    await until(() => t.events.includes("applied"), "the beat");
    expect(sigil.style.getPropertyValue("display")).toBe("");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.events).toEqual([`paint ${width}x${height}`, "applied"]);
  });

  test("in an element the beat creates, the whole beat waits for the picture: the element is made hidden, the rest of the beat holds, and the beat fires once it is drawn", async () => {
    const t = await setup({ holdRasters: true });
    const stage = t.h.overlay.querySelector(".stage") as HTMLElement & { __sdId?: string };
    const sigil = t.h.overlay.querySelector(".sigil") as HTMLElement & { __sdId?: string };
    t.beat([show("plaque", "emblem", ["/src/emblem.svg"])], 40, [
      { method: "ui/create", params: { parent: stage.__sdId, element: "made-plaque", type: "div", name: "plaque", breakpoints: {} } },
      { method: "ui/create", params: { parent: "made-plaque", element: "made-plaque-image", type: "div", name: "image", breakpoints: {} } },
      { method: "ui/update", params: { element: sigil.__sdId, style: { opacity: "0.5" }, breakpoints: {} } },
    ]);
    await until(() => t.rasters.length === 1, "the raster");
    const plaque = t.h.overlay.querySelector(".plaque") as HTMLElement;
    expect(plaque.style.getPropertyValue("visibility")).toBe("hidden");
    expect(sigil.style.getPropertyValue("opacity")).toBe("");
    expect(t.events).toEqual([]);
    expect(marks(40)["fired"]).toBeUndefined();
    const asked = t.rasters[0]!;
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => marks(40)["fired"] !== undefined, "the fired mark");
    expect(plaque.style.getPropertyValue("visibility")).toBe("");
    expect(sigil.style.getPropertyValue("opacity")).toBe("0.5");
    expect(t.events).toEqual([`paint ${asked.width}x${asked.height}`, "applied"]);
    expect(marks(40)["ready"]).toBeGreaterThanOrEqual(Math.max(...t.paints.map((paint) => paint.at)));
    expect(marks(40)["fired"]).toBeGreaterThanOrEqual(marks(40)["ready"]!);
  });
});

const KIT = ["base", "closed", "open"];

const KIT_CONTEXT = {
  image: Object.fromEntries(KIT.map((name) => [name, { $type: "image", $name: name, src: `/src/${name}.png`, uri: `file:///${name}.png` }])),
  layered_image: {
    kit: {
      $type: "layered_image",
      $name: "kit",
      assets: { base: { $name: "base" }, "mouth.closed default": { $name: "closed" }, "mouth.open": { $name: "open" } },
    },
  },
};

describe("a layered bitmap picture a morph plays on is drawn before its beat fires (#2810)", () => {
  test("when its morph's drawing is not ready at the timeout, the beat applies with its still picture and the game warns once", async () => {
    const t = await setup();
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.playback.configure({ host: { resolve: () => new Promise(() => {}) } as never });
    const files = KIT.map((name) => ({ src: `/src/${name}.png`, name: `${name}.png` }));
    t.beat([
      {
        target: "badge",
        instant: false,
        instructions: [
          {
            control: "show",
            content: {
              background: 'url("/src/closed.png"), url("/src/base.png")',
              imageNames: "kit",
              srcs: files.map((file) => file.src),
              morph: {
                plays: [
                  {
                    layer: 0,
                    picture: { span: 2, files },
                    ref: { morphs: ["m"], key: "kit-late", image: "kit", selection: "{}", groups: ["mouth"] },
                    morph: "m",
                    timing: { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as never,
                    definition: "d",
                  },
                ],
                epoch: 0,
              },
              pictures: [{ layer: 0, span: 2, name: "kit", files: files.slice(0, 2) }],
            },
          },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "kit", file: "base.png", reason: "late" });
    expect(t.spanOf("badge")!.style.getPropertyValue("background-image")).toBe('url("/src/closed.png"), url("/src/base.png")');
  });

  test("a vector layer its morph cannot draw shows the placeholder in place of the CSS picture, with one warning", async () => {
    const t = await setup({
      placeholders: true,
      load: async (src) => (src.endsWith(".svg") ? { ...vector(src), vector: undefined, styled: "filter" } : bitmap(src)),
    });
    const recipe = serializeMorphRecipe(
      buildMorphRecipe("m", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "closed" } }, { offset: 1, mouth: { state: "open" } }] } as never),
    );
    const context = {
      ...KIT_CONTEXT,
      image: { ...KIT_CONTEXT.image, base: { $type: "image", $name: "base", src: "/src/base.svg", uri: "file:///base.svg" } },
    };
    t.playback.configure({
      host: createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { m: recipe }, variants: {} }),
        readSource: layeredMorphSource(() => context as never),
      }),
    });
    const files = KIT.map((name) => (name === "base" ? { src: "/src/base.svg", name: "base.svg" } : { src: `/src/${name}.png`, name: `${name}.png` }));
    t.beat([
      {
        target: "badge",
        instant: false,
        instructions: [
          {
            control: "show",
            content: {
              background: 'url("/src/closed.png"), url("/src/base.svg")',
              imageNames: "kit",
              srcs: files.map((file) => file.src),
              morph: {
                plays: [
                  {
                    layer: 0,
                    picture: { span: 2, files },
                    ref: { morphs: ["m"], key: "kit-styled", image: "kit", selection: "{}", groups: ["mouth"] },
                    morph: "m",
                    timing: { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as never,
                    definition: "d",
                  },
                ],
                epoch: 0,
              },
              pictures: [{ layer: 0, span: 2, name: "kit", vector: true, files: files.slice(0, 2) }],
            },
          },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat");
    await until(() => !!t.shadowOf("badge")?.querySelector("[data-undrawn]"), "the placeholder");
    await flushMicrotasks(20);
    expect(t.shadowOf("badge")!.querySelector("[data-undrawn]")!.getAttribute("data-undrawn")).toBe("styled");
    expect(t.spanOf("badge")!.style.getPropertyValue("background-image")).toBe("none, none");
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "kit", file: "base.svg", reason: "styled", declaration: "filter", placeholder: true });
  });

  test("its morph canvas is painted before the beat is applied, and a change morph on it starts only when the beat applies", async () => {
    const t = await setup();
    const recipe = serializeMorphRecipe(
      buildMorphRecipe("m", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "closed" } }, { offset: 1, mouth: { state: "open" } }] } as never),
    );
    t.playback.configure({
      host: createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { m: recipe }, variants: {} }),
        readSource: layeredMorphSource(() => KIT_CONTEXT as never),
      }),
    });
    const files = KIT.map((name) => ({ src: `/src/${name}.png`, name: `${name}.png` }));
    const morph: MorphImageContent = {
      plays: [
        {
          layer: 0,
          picture: { span: 2, files },
          ref: { morphs: ["m"], key: "kit-mouth", image: "kit", selection: "{}", groups: ["mouth"] },
          morph: "m",
          timing: { trigger: "change", duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as never,
          definition: "d",
        },
      ],
      epoch: 0,
    };
    const startChange = t.playback.startChange.bind(t.playback);
    vi.spyOn(t.playback, "startChange").mockImplementation((...args) => {
      t.events.push("started");
      startChange(...args);
    });
    t.beat([
      {
        target: "badge",
        instant: false,
        instructions: [
          {
            control: "show",
            content: {
              background: 'url("/src/closed.png"), url("/src/base.png")',
              imageNames: "kit",
              srcs: files.map((file) => file.src),
              morph,
              pictures: [{ layer: 0, span: 2, name: "kit", files: files.slice(0, 2) }],
            },
          },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat");
    const applied = t.events.indexOf("applied");
    expect(t.events.slice(0, applied).some((event) => event.startsWith("paint"))).toBe(true);
    await until(() => t.events.includes("started"), "the change morph");
    expect(t.events.indexOf("started")).toBeGreaterThan(applied);
    expect(t.events.filter((event) => event === "started")).toHaveLength(1);
  });
});

describe("a picture that cannot be drawn shows a placeholder in the previews and nothing in an exported game (#2810)", () => {
  test.for([
    ["the rasteriser refuses", { refuse: () => true }, "undrawn"],
    ["its SVG has no size of its own", { load: async (src: string) => ({ ...vector(src), vector: undefined, unsized: true }) }, "unsized"],
  ] as const)("%s: one warning, a placeholder with previews on", async ([, options, reason]) => {
    const t = await setup({ ...options, placeholders: true });
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])]);
    await until(() => t.events.includes("applied"), "the beat");
    await flushMicrotasks(10);
    const placeholder = t.shadowOf("backdrop")!.querySelector("[data-undrawn]") as HTMLElement;
    expect(placeholder).not.toBeNull();
    expect(placeholder.getAttribute("data-undrawn")).toBe(reason);
    expect(placeholder.textContent).toContain("dusk");
    expect(t.shadowOf("backdrop")!.querySelector("canvas")).toBeNull();
    expect(t.spanOf("backdrop")!.style.getPropertyValue("background-image")).toBe("none");
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "dusk", file: "dusk.svg", reason, placeholder: true });
  });

  test("with previews off the picture's place stays empty, with the same one warning", async () => {
    const t = await setup({ refuse: () => true, placeholders: false });
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])]);
    await until(() => t.events.includes("applied"), "the beat");
    await flushMicrotasks(10);
    const shadow = t.shadowOf("backdrop");
    expect(shadow?.querySelector("[data-undrawn]") ?? null).toBeNull();
    expect(shadow?.querySelector("canvas") ?? null).toBeNull();
    expect(t.spanOf("backdrop")!.style.getPropertyValue("background-image")).toBe("none");
    expect(t.reports).toHaveBeenCalledTimes(1);
  });

  test("a picture whose file is still loading when the timeout runs out shows the late placeholder, and its drawing replaces it", async () => {
    let finish: (() => void) | undefined;
    const t = await setup({
      placeholders: true,
      load: (src) => new Promise((resolve) => (finish = () => resolve(vector(src)))),
    });
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])]);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    expect(t.shadowOf("backdrop")?.querySelector("[data-undrawn]")?.getAttribute("data-undrawn")).toBe("late");
    finish!();
    await until(() => !!t.shadowOf("backdrop")?.querySelector("canvas"), "the drawing");
    expect(t.shadowOf("backdrop")!.querySelector("[data-undrawn]")).toBeNull();
    expect(t.reports).toHaveBeenCalledTimes(1);
  });

  test("a vector picture a morph plays on, neither of whose drawings is ready at the timeout, warns once", async () => {
    const t = await setup({ holdRasters: true, placeholders: true });
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.playback.configure({ host: { resolve: () => new Promise(() => {}) } as never });
    const files = [
      { src: "/src/kit.svg", name: "kit.svg" },
      { src: "/src/hat.png", name: "hat.png" },
    ];
    t.beat([
      {
        target: "badge",
        instant: false,
        instructions: [
          {
            control: "show",
            content: {
              background: 'url("/src/hat.png"), url("/src/kit.svg")',
              imageNames: "kit",
              srcs: files.map((file) => file.src),
              morph: {
                plays: [
                  {
                    layer: 0,
                    picture: { span: 2, files },
                    ref: { morphs: ["m"], key: "kit-vector-late", image: "kit", selection: "{}", groups: ["mouth"] },
                    morph: "m",
                    timing: { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as never,
                    definition: "d",
                  },
                ],
                epoch: 0,
              },
              pictures: [{ layer: 0, span: 2, name: "kit", vector: true, files }],
            },
          },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    await flushMicrotasks(20);
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "kit", file: "kit.svg", reason: "late", placeholder: true });
  });

  test("a picture not drawn when the timeout runs out and then refused keeps one warning, and its placeholder takes the refusal's reason", async () => {
    const t = await setup({ holdRasters: true, placeholders: true });
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])]);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    expect(t.shadowOf("backdrop")!.querySelector("[data-undrawn]")?.getAttribute("data-undrawn")).toBe("late");
    t.rasters[0]!.resolve(undefined);
    await until(() => t.shadowOf("backdrop")?.querySelector("[data-undrawn]")?.getAttribute("data-undrawn") === "undrawn", "the refusal");
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "dusk", file: "dusk.svg", reason: "late", placeholder: true });
  });

  test("a picture not drawn when the timeout runs out gets the placeholder and one warning, and its drawing replaces the placeholder when it lands", async () => {
    const t = await setup({ holdRasters: true, placeholders: true });
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.beat([show("backdrop", "dusk", ["/src/dusk.svg"])]);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    expect(t.events).toEqual(["applied"]);
    const shadow = t.shadowOf("backdrop")!;
    expect(shadow.querySelector("[data-undrawn]")?.getAttribute("data-undrawn")).toBe("late");
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "dusk", file: "dusk.svg", reason: "late", placeholder: true });
    const asked = t.rasters[0]!;
    asked.resolve(raster(asked.src, asked.width, asked.height));
    await until(() => !!t.shadowOf("backdrop")?.querySelector("canvas"), "the drawing");
    expect(t.shadowOf("backdrop")!.querySelector("[data-undrawn]")).toBeNull();
    expect(t.events).toEqual(["applied", `paint ${asked.width}x${asked.height}`]);
    expect(t.reports).toHaveBeenCalledTimes(1);
  });
});
