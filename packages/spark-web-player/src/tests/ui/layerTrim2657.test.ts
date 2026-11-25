import { afterEach, describe, expect, test, vi } from "vitest";
import type { LayeredPicture } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { AssetCache, type ImageTarget, type LayerFile } from "../../app/assets/AssetCache";
import AssetManager from "../../app/managers/AssetManager";
import { paintedBox, TRIM_MARGIN, type TrimmedLayer } from "../../app/morph/layerTrim";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

const pixels = (width: number, height: number, painted: [number, number, number][] = []) => {
  const data = new Uint8ClampedArray(width * height * 4);
  for (const [x, y, alpha] of painted) data[(y * width + x) * 4 + 3] = alpha;
  return data;
};

describe("the painted box of a layer file (#2657)", () => {
  test("a fully transparent image has no painted box", () => {
    expect(paintedBox(pixels(8, 6), 8, 6, TRIM_MARGIN)).toBeUndefined();
  });

  test("a fully opaque image's box is the whole canvas", () => {
    const data = new Uint8ClampedArray(8 * 6 * 4).fill(255);
    expect(paintedBox(data, 8, 6, TRIM_MARGIN)).toEqual({ x: 0, y: 0, width: 8, height: 6 });
  });

  test("one pixel painted in a corner gives that pixel grown by the margin inside the canvas", () => {
    expect(paintedBox(pixels(20, 10, [[0, 0, 255]]), 20, 10, TRIM_MARGIN)).toEqual({ x: 0, y: 0, width: 3, height: 3 });
    expect(paintedBox(pixels(20, 10, [[19, 9, 255]]), 20, 10, TRIM_MARGIN)).toEqual({ x: 17, y: 7, width: 3, height: 3 });
  });

  test("a pixel with alpha 1 counts as painted, and alpha 0 is the only empty", () => {
    expect(paintedBox(pixels(20, 10, [[10, 5, 1]]), 20, 10, TRIM_MARGIN)).toEqual({ x: 8, y: 3, width: 5, height: 5 });
  });

  test("the margin grows the box on every side and stops at the canvas edge", () => {
    expect(paintedBox(pixels(20, 10, [[1, 4, 9], [15, 8, 200]]), 20, 10, TRIM_MARGIN)).toEqual({ x: 0, y: 2, width: 18, height: 8 });
    expect(paintedBox(pixels(20, 10, [[5, 3, 255], [12, 6, 255]]), 20, 10, TRIM_MARGIN)).toEqual({ x: 3, y: 1, width: 12, height: 8 });
  });
});

const NATURAL = { width: 1920, height: 1080 };

const image = (): ImageTarget => {
  const target = { onload: null, onerror: null, naturalWidth: NATURAL.width, naturalHeight: NATURAL.height } as unknown as ImageTarget;
  let src = "";
  Object.defineProperty(target, "src", {
    get: () => src,
    set: (value: string) => {
      src = value;
      queueMicrotask(() => target.onload?.call(target, {}));
    },
  });
  return target;
};

const trimmedLayer = (src: string, box: TrimmedLayer["box"], closed: string[]): TrimmedLayer => ({
  image: { src: `${src}#trimmed`, width: box.width, height: box.height, close: () => closed.push(src) } as never,
  box,
  ...NATURAL,
});

const BOXES: Record<string, TrimmedLayer["box"] | undefined> = {
  "desk.png": { x: 600, y: 500, width: 400, height: 300 },
  "lamp.png": undefined,
};

function trimmingCache(options: { trimLayers?: boolean; predictBytes?: number } = {}) {
  const closed: string[] = [];
  const asked: [string, boolean][] = [];
  const warmed: string[] = [];
  const cache = new AssetCache(
    {
      createImage: image,
      warmImage: (src) => {
        warmed.push(src);
        return { remove: () => warmed.splice(warmed.indexOf(src), 1) };
      },
      inspectImage: async (src, trim): Promise<LayerFile> => {
        asked.push([src, trim]);
        const box = BOXES[src];
        return { animated: false, profile: false, ...(trim && box ? { trimmed: trimmedLayer(src, box, closed) } : {}) };
      },
    },
    options,
  );
  return { cache, closed, asked, warmed };
}

const layers = (...srcs: string[]) => srcs.map((src) => ({ kind: "image" as const, src, layer: true as const }));

describe("a trimmed layer in the asset cache (#2657)", () => {
  test("a trimmed layer is counted at its trimmed size and an untrimmed one at its natural size", async () => {
    const { cache, warmed } = trimmingCache();
    await cache.request(layers("desk.png", "lamp.png"), 0, "line", undefined);
    const stats = cache.stats();
    expect(stats.bytes.image).toBe(400 * 300 * 4 + NATURAL.width * NATURAL.height * 4);
    expect(cache.picture("desk.png")).toMatchObject({ box: BOXES["desk.png"], ...NATURAL, image: { src: "desk.png#trimmed" } });
    expect(cache.picture("lamp.png")?.box).toBeUndefined();
    expect(warmed).toEqual(["desk.png", "lamp.png"]);
  });

  test("a layer the page draws whole is counted whole, let go of without closing, and never trimmed again", async () => {
    const { cache, closed } = trimmingCache();
    await cache.request(layers("desk.png", "lamp.png"), 0, "line", undefined);
    const shown = cache.picture("desk.png")!.image;
    cache.keepWhole(["desk.png", "lamp.png", "missing.png"]);
    expect(cache.picture("desk.png")?.box).toBeUndefined();
    expect(cache.stats().bytes.image).toBe(2 * NATURAL.width * NATURAL.height * 4);
    expect(cache.bytes).toBe(2 * NATURAL.width * NATURAL.height * 4);
    expect(closed).toEqual([]);
    expect(shown).toMatchObject({ src: "desk.png#trimmed" });

    const loading = trimmingCache();
    const request = loading.cache.request(layers("desk.png"), 0, "line", undefined);
    loading.cache.keepWhole(["desk.png"]);
    await request;
    expect(loading.cache.picture("desk.png")?.box).toBeUndefined();
    expect(loading.cache.stats().bytes.image).toBe(NATURAL.width * NATURAL.height * 4);
    expect(loading.closed).toEqual(["desk.png"]);
  });

  test("a file first drawn whole as a plain image stays whole when a layered picture later loads it as a layer", async () => {
    const { cache } = trimmingCache();
    await cache.request([{ kind: "image", src: "desk.png" }], 0, "line", undefined);
    cache.keepWhole(["desk.png"]);
    await cache.request(layers("desk.png"), 0, "line", undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cache.picture("desk.png")?.box).toBeUndefined();
    expect(cache.stats().bytes.image).toBe(NATURAL.width * NATURAL.height * 4);
  });

  test("a changed file's entry is dropped, and its bitmap is closed only when no picture on screen shows it", async () => {
    const shown = trimmingCache();
    shown.cache.setDerivedPins(() => ["desk.png"]);
    await shown.cache.request(layers("desk.png"), 0, "line", undefined);
    shown.cache.evictFile("desk.png");
    expect(shown.cache.has("desk.png")).toBe(false);
    expect(shown.closed).toEqual([]);

    const hidden = trimmingCache();
    await hidden.cache.request(layers("desk.png"), 0, "line", undefined);
    hidden.cache.evictFile("desk.png");
    expect(hidden.closed).toEqual(["desk.png"]);
  });

  test("dropping a trimmed layer's entry closes its bitmap", async () => {
    const { cache, closed } = trimmingCache();
    await cache.request(layers("desk.png", "lamp.png"), 0, "beat:1");
    expect(closed).toEqual([]);
    cache.release(["beat:1"], true);
    expect(cache.has("desk.png")).toBe(false);
    expect(closed).toEqual(["desk.png"]);
  });

  test("with trimming off no layer is asked to be trimmed or counted trimmed, and turning it off untrims what is resident without closing a bitmap a picture may still be drawing", async () => {
    const off = trimmingCache({ trimLayers: false });
    await off.cache.request(layers("desk.png"), 0, "line", undefined);
    expect(off.asked).toEqual([["desk.png", false]]);
    expect(off.cache.picture("desk.png")?.box).toBeUndefined();
    expect(off.cache.stats().bytes.image).toBe(NATURAL.width * NATURAL.height * 4);

    const on = trimmingCache();
    await on.cache.request(layers("desk.png"), 0, "line", undefined);
    expect(on.cache.stats().bytes.image).toBe(400 * 300 * 4);
    const shown = on.cache.picture("desk.png")!.image;
    on.cache.configure({ trimLayers: false });
    expect(on.closed).toEqual([]);
    expect(shown).toMatchObject({ src: "desk.png#trimmed" });
    expect(on.cache.picture("desk.png")?.box).toBeUndefined();
    expect(on.cache.stats().bytes.image).toBe(NATURAL.width * NATURAL.height * 4);
    expect(on.cache.bytes).toBe(NATURAL.width * NATURAL.height * 4);
  });

  test("the page's assets/configure carries trim_layers to the cache", async () => {
    restore = installJSDOM().restore;
    const { cache, asked } = trimmingCache();
    const manager = new AssetManager({ overlay: document.createElement("div"), emit: () => {}, assetCache: cache } as any);
    await manager.onInit();
    manager.onReceiveNotification({ jsonrpc: "2.0", method: "assets/configure", params: { predictBytes: 0, loadBytes: 0, trimLayers: false } } as any);
    expect(cache.trimLayers).toBe(false);
    await cache.request(layers("desk.png"), 0, "line", undefined);
    expect(asked).toEqual([["desk.png", false]]);
    expect(cache.picture("desk.png")?.box).toBeUndefined();
  });
});

interface Drawn {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const OFFICE: LayeredPicture = {
  layer: 0,
  span: 3,
  files: ["office.png", "desk.png", "lamp.png"].map((src) => ({ src, name: src })),
};
const SRCS = OFFICE.files.map((file) => file.src);

function mountOffice(resident: (src: string) => PictureBitmap | undefined, canvas = true) {
  const env = installJSDOM();
  restore = env.restore;
  const frames: Drawn[][] = [];
  const context = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setTransform: () => {},
    clearRect: () => frames.push([]),
    drawImage(source: CanvasImageSource, x: number, y: number, width: number, height: number) {
      frames.at(-1)!.push({ src: (source as unknown as { src: string }).src, x, y, width, height });
    },
  } as PictureCanvasContext;
  const playback = new MorphPlayback(env.overlay, { requestFrame: () => 0, cancelFrame: () => {}, pictureCanvas: () => (canvas ? context : undefined) });
  const kept: string[][] = [];
  playback.keepWhole = (srcs) => kept.push(srcs);
  playback.residentPicture = resident;
  const span = env.overlay.ownerDocument.createElement("span");
  span.style.setProperty("width", "800px");
  span.style.setProperty("height", "300px");
  span.style.setProperty("background-size", "auto 100%");
  span.style.setProperty("background-position", "center");
  span.style.setProperty("background-repeat", "no-repeat");
  env.overlay.appendChild(span);
  const background = SRCS.map((src) => `url("${src}")`).reverse().join(", ");
  span.style.setProperty("background-image", background);
  playback.mount(span, { plays: [], epoch: 0 }, background, "background", "backdrop:background_image:0", undefined, [OFFICE]);
  return { frames, kept, span };
}

describe("a trimmed layer on the picture's canvas (#2657)", () => {
  test("each trimmed layer is drawn at its box inside the picture's rectangle, and a layer whose trimming failed fills the rectangle", () => {
    const boxes: Record<string, PictureBitmap["box"]> = {
      "office.png": { x: 0, y: 0, width: 40, height: 20 },
      "desk.png": { x: 10, y: 6, width: 8, height: 12 },
    };
    const { frames, kept } = mountOffice((src) => ({ image: { src } as never, width: 40, height: 30, ...(boxes[src] ? { box: boxes[src] } : {}) }));
    expect(kept).toEqual([]);
    expect(frames).toEqual([
      [
        { src: "office.png", x: 200, y: 0, width: 400, height: 200 },
        { src: "desk.png", x: 300, y: 60, width: 80, height: 120 },
        { src: "lamp.png", x: 200, y: 0, width: 400, height: 300 },
      ],
    ]);
  });

  test("a picture whose canvas cannot be made keeps its CSS drawing and asks for every one of its files whole", () => {
    const box = { x: 10, y: 6, width: 8, height: 12 };
    const { frames, kept, span } = mountOffice((src) => ({ image: { src } as never, width: 40, height: 30, box }), false);
    expect(frames).toEqual([]);
    expect(span.querySelector("span.morph")?.shadowRoot?.querySelector("canvas") ?? null).toBeNull();
    expect(kept).toEqual([SRCS]);
  });

  test("a picture that keeps its CSS drawing asks for every one of its files whole", () => {
    const box = { x: 10, y: 6, width: 8, height: 12 };
    const { frames, kept, span } = mountOffice((src) => ({ image: { src } as never, width: 40, height: 30, box, ...(src === "lamp.png" ? { animated: true } : {}) }));
    expect(frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(SRCS.map((src) => `url("${src}")`).reverse().join(", "));
    expect(kept).toEqual([SRCS]);
  });
});

const P = "inmemory:///assets/Images";
const imageFile = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}` };
};

describe("an image write asks for the files it does not draw on a canvas whole (#2657)", () => {
  test("a single image's files are asked for whole, and a layered picture drawn on its canvas is not", async () => {
    const source = ["scene start", "  HERO:", "    [[show portrait ava]]", "    Line one.", "  HERO:", "    [[show portrait sky]]", "    Line two.", "end", ""].join("\n");
    const h = createDOMHarness(source, 0, { files: [imageFile("ava.png"), imageFile("ava mouth.closed default.png"), imageFile("sky.png")] as never });
    await h.ready;
    MorphPlayback.for(h.overlay).configure({
      requestFrame: () => 0,
      cancelFrame: () => {},
      pictureCanvas: () => ({ globalAlpha: 1, imageSmoothingEnabled: true, setTransform: () => {}, clearRect: () => {}, drawImage: () => {} }),
      loadPicture: async (src) => ({ image: { src } as never, width: 40, height: 30 }),
    });
    restore = () => h.ui.onDispose();
    const kept: string[][] = [];
    const cache = (h.ui as any).app.assetCache as AssetCache;
    cache.keepWhole = (srcs) => {
      kept.push([...srcs]);
    };
    await h.preview(source.split("\n").findIndex((line) => line.includes("Line one.")));
    await flushMicrotasks(20);
    expect(kept.flat().filter((src) => src.includes("ava"))).toEqual([]);
    await h.preview(source.split("\n").findIndex((line) => line.includes("Line two.")));
    await flushMicrotasks(20);
    expect(kept).toContainEqual(["/src/sky.png"]);
  });
});
