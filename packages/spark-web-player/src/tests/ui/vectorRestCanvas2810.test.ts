import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
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

async function setup(options: { placeholders?: boolean; holdRasters?: boolean; refuse?: (src: string) => boolean; load?: (src: string) => Promise<PictureBitmap | undefined> } = {}) {
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
  sheet.textContent = `.instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; }`;
  win.document.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains("instance") ? BOX.width : 0;
    },
  });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const scale = this.classList.contains("instance") ? STYLE_SCALE * pictureViewOf(this).zoom : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: BOX.width * scale, bottom: BOX.height * scale, width: BOX.width * scale, height: BOX.height * scale, toJSON() {} };
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
  const spanOf = (target: string) => (Array.from(h.overlay.querySelectorAll(`.${target} > .image > .instance`)) as HTMLElement[]).at(-1);
  const shadowOf = (target: string) => spanOf(target)?.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const pending = () => (h.overlay as HTMLElement & { __sdBeat?: unknown }).__sdBeat !== undefined;
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
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
    t.beat([
      {
        ...show("backdrop", "dusk", ["/src/dusk.svg"], { framing: { x: 0.5, y: 0.5, zoom: 2 }, enter: grow }),
        instructions: [
          show("backdrop", "dusk", ["/src/dusk.svg"], { framing: { x: 0.5, y: 0.5, zoom: 2 }, enter: grow }).instructions[0]!,
          { control: "animate", travel: { framing: { x: 0.5, y: 0.5, zoom: 3 }, timing: { delay: "0s", duration: "2s", easing: "linear" } } },
        ],
      },
    ]);
    await until(() => t.events.includes("applied"), "the beat");
    const width = Math.round(BOX.width * DPR * 3 * STYLE_SCALE * 1.25);
    const height = Math.round(BOX.height * DPR * 3 * STYLE_SCALE * 1.25);
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
