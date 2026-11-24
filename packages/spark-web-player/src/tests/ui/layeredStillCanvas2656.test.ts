import { afterEach, describe, expect, test, vi } from "vitest";
import { placePicture } from "../../../../spark-dom/src/utils/placePicture";
import type { LayeredPicture } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { AssetCache, type ImageTarget } from "../../app/assets/AssetCache";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

interface Drawn {
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  alpha: number;
}

function recordingCanvas() {
  const frames: Drawn[][] = [];
  const smoothing: boolean[] = [];
  const blends: string[] = [];
  const fills: { style: unknown; x: number; y: number; width: number; height: number }[] = [];
  const context: PictureCanvasContext = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    globalCompositeOperation: "source-over",
    fillStyle: "",
    setTransform: () => {},
    clearRect: () => {
      frames.push([]);
    },
    drawImage(image, x, y, width, height) {
      frames.at(-1)!.push({ src: (image as unknown as { src: string }).src, x, y, width, height, alpha: context.globalAlpha });
      smoothing.push(context.imageSmoothingEnabled);
      blends.push(context.globalCompositeOperation!);
    },
    fillRect(x, y, width, height) {
      fills.push({ style: context.fillStyle, x, y, width, height });
    },
  };
  return { frames, smoothing, blends, fills, factory: () => context };
}

const bitmap = (src: string, extra: Partial<PictureBitmap> = {}): PictureBitmap => ({
  image: { src } as never,
  width: 40,
  height: 30,
  ...extra,
});

const OFFICE: LayeredPicture = {
  layer: 0,
  span: 3,
  files: ["office.png", "desk.png", "lamp.png"].map((src) => ({ src, name: src })),
};

const backgroundOf = (srcs: string[]) => srcs.map((src) => `url("${src}")`).reverse().join(", ");

function setup(options: {
  resident?: (src: string) => PictureBitmap | undefined;
  load?: (src: string) => Promise<PictureBitmap | undefined>;
  size?: { width: number; height: number };
  backgroundSize?: string;
} = {}) {
  const env = installJSDOM();
  restore = env.restore;
  const canvas = recordingCanvas();
  const loads: string[] = [];
  const frames: ((now: number) => void)[] = [];
  const playback = new MorphPlayback(env.overlay, {
    requestFrame: (callback) => frames.push(callback),
    cancelFrame: () => {},
    pictureCanvas: canvas.factory,
    loadPicture: async (src) => {
      loads.push(src);
      return options.load ? options.load(src) : bitmap(src);
    },
  });
  if (options.resident) playback.residentPicture = options.resident;
  const span = env.overlay.ownerDocument.createElement("span");
  const size = options.size ?? { width: 800, height: 300 };
  span.style.setProperty("width", `${size.width}px`);
  span.style.setProperty("height", `${size.height}px`);
  span.style.setProperty("background-size", options.backgroundSize ?? "auto 100%");
  span.style.setProperty("background-position", "center");
  span.style.setProperty("background-repeat", "no-repeat");
  env.overlay.appendChild(span);
  const mount = (srcs: string[], pictures: LayeredPicture[], kind: "background" | "mask" = "background") => {
    const background = backgroundOf(srcs);
    span.style.setProperty(kind === "mask" ? "mask-image" : "background-image", background);
    return playback.mount(span, { plays: [], epoch: 0 }, background, kind, "backdrop:background_image:0", undefined, pictures);
  };
  const flushFrame = () => {
    for (const callback of frames.splice(0)) callback(0);
  };
  return { playback, span, canvas, loads, mount, frames, flushFrame };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const shadowOf = (span: HTMLElement) => span.querySelector("span.morph")?.shadowRoot ?? null;
const canvasOf = (span: HTMLElement) => shadowOf(span)?.querySelector("canvas") ?? null;
const boxOf = (span: HTMLElement) => canvasOf(span)?.parentElement ?? null;
const SRCS = ["office.png", "desk.png", "lamp.png"];

describe("a still layered picture made of image files is drawn on a canvas (#2656)", () => {
  test("with its layer files already loaded, it is drawn on the canvas as it is mounted: each layer once, bottom first, in the picture's rectangle", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    mount(SRCS, [OFFICE]);
    expect(canvasOf(span)).not.toBeNull();
    expect(span.style.getPropertyValue("background-image")).toBe("none, none, none");
    expect(boxOf(span)!.getAttribute("style")).toBe("position:absolute;left:0px;top:0px;width:800px;height:300px");
    const element = canvasOf(span)!;
    expect([element.width, element.height]).toEqual([800, 300]);
    expect(canvas.frames).toEqual([
      SRCS.map((src) => ({ src, x: 200, y: 0, width: 400, height: 300, alpha: 1 })),
    ]);
  });

  test("it is drawn again at the new size after its box is resized", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    const layer = mount(SRCS, [OFFICE]);
    span.style.setProperty("height", "600px");
    layer.layout();
    expect(boxOf(span)!.getAttribute("style")).toBe("position:absolute;left:0px;top:0px;width:800px;height:600px");
    expect(canvas.frames).toHaveLength(2);
    expect(canvas.frames[1]).toEqual(SRCS.map((src) => ({ src, x: 0, y: 0, width: 800, height: 600, alpha: 1 })));
  });

  test("a picture over another image keeps that image under the canvas, in its CSS order", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    mount(["sky.png", ...SRCS], [{ ...OFFICE, layer: 1 }]);
    const children = Array.from(shadowOf(span)!.children) as HTMLElement[];
    expect(children).toHaveLength(2);
    expect(children[0]!.getAttribute("style")).toContain('background-image:url("sky.png")');
    expect(children[1]!.querySelector("canvas")).not.toBeNull();
    expect(canvas.frames.at(-1)!.map((drawn) => drawn.src)).toEqual(SRCS);
  });

  test("while its layer files load, the picture is not shown as CSS, and it is drawn on the canvas once they have all decoded", async () => {
    const waiting = new Map<string, (value: PictureBitmap) => void>();
    const { span, canvas, mount } = setup({
      load: (src) => new Promise((resolve) => waiting.set(src, resolve)),
    });
    mount(["sky.png", ...SRCS], [{ ...OFFICE, layer: 1 }]);
    expect(canvasOf(span)).toBeNull();
    expect(span.style.getPropertyValue("background-image")).toBe('none, none, none, url("sky.png")');
    await until(() => waiting.size === 3, "the loads");
    waiting.get("office.png")!(bitmap("office.png"));
    waiting.get("desk.png")!(bitmap("desk.png"));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(canvasOf(span)).toBeNull();
    expect(span.style.getPropertyValue("background-image")).toBe('none, none, none, url("sky.png")');
    waiting.get("lamp.png")!(bitmap("lamp.png"));
    await until(() => !!canvasOf(span), "the canvas");
    expect(canvas.frames).toEqual([SRCS.map((src) => ({ src, x: 200, y: 0, width: 400, height: 300, alpha: 1 }))]);
  });

  test.each([
    ["an animated layer file", { animated: true }],
    ["a layer file with a colour profile other than sRGB", { profile: true }],
    ["a layer file whose bytes could not be read", { unread: true }],
    ["a layer file of another pixel size", { width: 41 }],
  ] as const)("a picture with %s keeps its CSS background, as today", async (_, odd) => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src, src === "desk.png" ? odd : {}) });
    mount(SRCS, [OFFICE]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(canvasOf(span)).toBeNull();
    expect(span.querySelector("span.morph")).toBeNull();
    expect(span.style.getPropertyValue("background-image")).toBe(backgroundOf(SRCS));
    expect(canvas.frames).toEqual([]);
  });

  test("the hidden images that give a framed picture its width take the layer files' shape before they decode", () => {
    const { span, mount } = setup({ resident: (src) => bitmap(src) });
    for (const src of ["sky.png", ...SRCS]) {
      const img = span.ownerDocument.createElement("img");
      img.className = "object";
      img.setAttribute("src", src);
      span.appendChild(img);
    }
    mount(["sky.png", ...SRCS], [{ ...OFFICE, layer: 1 }]);
    const ratios = Array.from(span.querySelectorAll("img.object"), (img) => (img as HTMLElement).style.getPropertyValue("aspect-ratio"));
    expect(ratios).toEqual(["", "auto 40 / 30", "auto 40 / 30", "auto 40 / 30"]);
  });

  test("a hidden image whose aspect ratio the author set keeps it", () => {
    const { span, mount } = setup({ resident: (src) => bitmap(src) });
    const style = span.ownerDocument.createElement("style");
    style.textContent = "img.object { aspect-ratio: 1 / 1; }";
    span.ownerDocument.head.appendChild(style);
    for (const src of SRCS) {
      const img = span.ownerDocument.createElement("img");
      img.className = "object";
      img.setAttribute("src", src);
      span.appendChild(img);
    }
    expect(span.ownerDocument.defaultView!.getComputedStyle(span.querySelector("img.object")!).getPropertyValue("aspect-ratio")).toBe("1 / 1");
    mount(SRCS, [OFFICE]);
    expect(canvasOf(span)).not.toBeNull();
    const ratios = Array.from(span.querySelectorAll("img.object"), (img) => (img as HTMLElement).style.getPropertyValue("aspect-ratio"));
    expect(ratios).toEqual(["", "", ""]);
  });

  test("a picture whose layers are placed differently from each other draws each layer where CSS places it", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    span.style.setProperty("background-size", "auto 100%, 50% 50%, auto 100%, auto 100%");
    mount(["sky.png", ...SRCS], [{ ...OFFICE, layer: 1 }]);
    expect(canvasOf(span)).not.toBeNull();
    expect(span.style.getPropertyValue("background-image")).toBe("none, none, none, none");
    expect(canvas.frames.at(-1)).toEqual([
      { src: "office.png", x: 200, y: 0, width: 400, height: 300, alpha: 1 },
      { src: "desk.png", x: 200, y: 75, width: 400, height: 150, alpha: 1 },
      { src: "lamp.png", x: 200, y: 0, width: 400, height: 300, alpha: 1 },
    ]);
  });

  test("a repeating picture is tiled on the canvas as CSS tiles it, and calc() sizes are resolved", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src), size: { width: 200, height: 100 } });
    span.style.setProperty("background-size", "calc(50% - 50px) calc(100% - 50px)");
    span.style.setProperty("background-position", "0px 0px");
    span.style.setProperty("background-repeat", "repeat-x");
    mount(SRCS.slice(0, 2), [{ ...OFFICE, span: 2, files: OFFICE.files.slice(0, 2) }]);
    expect(canvas.frames.at(-1)).toEqual(
      ["office.png", "desk.png"].flatMap((src) => [0, 50, 100, 150].map((x) => ({ src, x, y: 0, width: 50, height: 50, alpha: 1 }))),
    );
  });

  test("a change of the picture's CSS placement while it is shown redraws the same canvas at the new placement before the next frame paints", () => {
    const { span, canvas, mount, flushFrame } = setup({ resident: (src) => bitmap(src) });
    mount(SRCS, [OFFICE]);
    const element = canvasOf(span);
    span.style.setProperty("background-position", "right top");
    flushFrame();
    expect(canvasOf(span)).toBe(element);
    expect(canvas.frames).toHaveLength(2);
    expect(canvas.frames.at(-1)).toEqual(SRCS.map((src) => ({ src, x: 400, y: 0, width: 400, height: 300, alpha: 1 })));
  });

  test("a class change on an ancestor that restyles the picture redraws the same canvas at the new placement", () => {
    const { span, canvas, mount, flushFrame } = setup({ resident: (src) => bitmap(src) });
    const sheet = span.ownerDocument.createElement("style");
    sheet.textContent = "span { background-position: center; } .moved span { background-position: right top; }";
    span.ownerDocument.head.appendChild(sheet);
    span.style.removeProperty("background-position");
    mount(SRCS, [OFFICE]);
    const painted = canvas.frames.length;
    span.parentElement!.classList.add("moved");
    flushFrame();
    expect(canvas.frames).toHaveLength(painted + 1);
    expect(canvas.frames.at(-1)!.map((drawn) => drawn.x)).toEqual([400, 400, 400]);
  });

  test("a stylesheet that changes while the picture is shown is followed", () => {
    const { span, canvas, mount, flushFrame } = setup({ resident: (src) => bitmap(src) });
    const sheet = span.ownerDocument.createElement("style");
    sheet.textContent = "span { background-position: left top; }";
    span.ownerDocument.head.appendChild(sheet);
    span.style.removeProperty("background-position");
    mount(SRCS, [OFFICE]);
    expect(canvas.frames.at(-1)!.map((drawn) => drawn.x)).toEqual([0, 0, 0]);
    sheet.textContent = "span { background-position: right top; }";
    flushFrame();
    expect(canvas.frames.at(-1)!.map((drawn) => drawn.x)).toEqual([400, 400, 400]);
  });

  test("while nothing about the picture's style changes, each frame's check lays nothing out and paints nothing, and the check stops once nothing is drawn", () => {
    const { span, canvas, mount, frames, flushFrame } = setup({ resident: (src) => bitmap(src) });
    const layer = mount(SRCS, [OFFICE]);
    const painted = canvas.frames.length;
    const layout = vi.spyOn(layer, "layout");
    for (let i = 0; i < 50; i++) flushFrame();
    expect(layout).not.toHaveBeenCalled();
    expect(canvas.frames).toHaveLength(painted);
    expect(frames).toHaveLength(1);
    for (let i = 0; i < 200; i++) span.parentElement!.classList.toggle("busy");
    span.style.setProperty("background-position", "right top");
    flushFrame();
    expect(layout).toHaveBeenCalledTimes(1);
    expect(canvas.frames).toHaveLength(painted + 1);
    layer.dispose();
    flushFrame();
    expect(frames).toHaveLength(0);
  });

  test("a picture element with a border keeps its canvas inside the padding box, so the border and anything under it are painted as before", () => {
    const { span, mount } = setup({ resident: (src) => bitmap(src) });
    span.style.setProperty("border", "10px solid rgb(0, 255, 0)");
    mount(SRCS, [OFFICE]);
    expect(shadowOf(span)!.host.getAttribute("style")).toContain("inset:0");
    expect(boxOf(span)!.getAttribute("style")).toBe("position:absolute;left:0px;top:0px;width:800px;height:300px");
  });

  test("an image beside a still picture keeps its own background origin, clip and the element's padding", () => {
    const { span, mount } = setup({ resident: (src) => bitmap(src) });
    span.style.setProperty("padding", "10px");
    span.style.setProperty("background-origin", "content-box");
    span.style.setProperty("background-clip", "content-box");
    mount([...SRCS, "sky.png"], [OFFICE]);
    const statics = Array.from(shadowOf(span)!.children).filter((child) => !child.querySelector("canvas")) as HTMLElement[];
    expect(statics).toHaveLength(1);
    const style = statics[0]!.getAttribute("style")!;
    expect(style).toContain("padding:10px 10px 10px 10px");
    expect(style).toContain("background-origin:content-box");
    expect(style).toContain("background-clip:content-box");
  });

  test("a picture drawn on a canvas keeps that canvas when the compositor rebuilds for a second picture, and both are drawn on canvases", async () => {
    const waiting = new Map<string, (value: PictureBitmap) => void>();
    const late = ["hall.png", "rug.png"];
    const { span, mount } = setup({
      resident: (src) => (late.includes(src) ? undefined : bitmap(src)),
      load: (src) => new Promise((resolve) => waiting.set(src, resolve)),
    });
    const layer = mount([...SRCS, ...late], [OFFICE, { layer: 3, span: 2, files: late.map((src) => ({ src, name: src })) }]);
    const first = canvasOf(span);
    expect(first).not.toBeNull();
    span.style.setProperty("background-repeat", "repeat");
    await until(() => waiting.size === 2, "the late loads");
    for (const src of late) waiting.get(src)!(bitmap(src));
    await until(() => !!(layer as any).stills[1].canvases, "the late picture's canvas");
    const canvases = Array.from(shadowOf(span)!.querySelectorAll("canvas"));
    expect(canvases).toHaveLength(2);
    expect(canvases[0]).toBe(first);
    expect((layer as any).stills[1].broken).toBeFalsy();
  });

  test("each layer that blends other than normally is drawn on its own canvas with that blend mode, so it blends with everything painted below it", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    span.style.setProperty("background-blend-mode", "normal, normal, multiply");
    mount(["sky.png", ...SRCS], [{ ...OFFICE, layer: 1 }]);
    const boxes = Array.from(shadowOf(span)!.querySelectorAll("canvas"), (element) => element.parentElement!.getAttribute("style"));
    expect(boxes).toEqual([
      "position:absolute;left:0px;top:0px;width:800px;height:300px;mix-blend-mode:multiply",
      "position:absolute;left:0px;top:0px;width:800px;height:300px",
    ]);
    expect(canvas.frames.slice(-2).map((frame) => frame.map((drawn) => drawn.src))).toEqual([["office.png"], ["desk.png", "lamp.png"]]);
  });

  test("a picture shown with pixelated or crisp image rendering is drawn without smoothing, and with smoothing otherwise", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    span.style.setProperty("image-rendering", "pixelated");
    expect(span.ownerDocument.defaultView!.getComputedStyle(span).getPropertyValue("image-rendering")).toBe("pixelated");
    const layer = mount(SRCS, [OFFICE]);
    expect(canvas.smoothing).toEqual([false, false, false]);
    span.style.setProperty("image-rendering", "auto");
    layer.layout();
    expect(canvas.smoothing).toEqual([false, false, false, true, true, true]);
  });

  test("a picture whose layer files load late but turn out animated is shown as CSS once loaded, never as a canvas", async () => {
    const { span, canvas, mount } = setup({ load: async (src) => bitmap(src, src === "lamp.png" ? { animated: true } : {}) });
    mount(SRCS, [OFFICE]);
    expect(span.style.getPropertyValue("background-image")).toBe("none, none, none");
    await until(() => span.style.getPropertyValue("background-image") === backgroundOf(SRCS), "the CSS background");
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
  });

  test("a layered picture used as a mask keeps its CSS mask", () => {
    const { span, canvas, mount } = setup({ resident: (src) => bitmap(src) });
    mount(SRCS, [OFFICE], "mask");
    expect(canvasOf(span)).toBeNull();
    expect(span.style.getPropertyValue("mask-image")).toBe(backgroundOf(SRCS));
    expect(canvas.frames).toEqual([]);
  });

  test("a framing that zooms in draws the canvas at the zoomed size, up to the files' own resolution", () => {
    const big = (src: string) => bitmap(src, { width: 1600, height: 1200 });
    const zoomed = setup({ resident: big, size: { width: 400, height: 300 } });
    placePicture(zoomed.span, { x: 0.5, y: 0.5, zoom: 2 });
    zoomed.mount(SRCS, [OFFICE]);
    expect([canvasOf(zoomed.span)!.width, canvasOf(zoomed.span)!.height]).toEqual([800, 600]);
    expect(boxOf(zoomed.span)!.getAttribute("style")).toBe("position:absolute;left:0px;top:0px;width:400px;height:300px");
    restore?.();
    const far = setup({ resident: big, size: { width: 400, height: 300 } });
    placePicture(far.span, { x: 0.5, y: 0.5, zoom: 8 });
    far.mount(SRCS, [OFFICE]);
    expect([canvasOf(far.span)!.width, canvasOf(far.span)!.height]).toEqual([1600, 1200]);
  });

  test("a layer file the asset cache has loaded and inspected as a layer file is drawn on the canvas as the picture is mounted", async () => {
    const images: ImageTarget[] = [];
    const cache = new AssetCache({
      createImage: () => {
        const target = { onload: null, onerror: null, naturalWidth: 40, naturalHeight: 30 } as unknown as ImageTarget;
        let src = "";
        Object.defineProperty(target, "src", {
          get: () => src,
          set: (value: string) => {
            src = value;
            queueMicrotask(() => target.onload?.call(target, {}));
          },
        });
        images.push(target);
        return target;
      },
      inspectImage: async () => ({ animated: false, profile: false }),
    });
    await cache.request(SRCS.map((src) => ({ kind: "image" as const, src, layer: true as const })), 0, "line", undefined);
    expect(SRCS.map((src) => cache.picture(src)?.image.src)).toEqual(SRCS);
    const { span, canvas, loads, mount } = setup({
      resident: (src) => {
        const picture = cache.picture(src);
        return picture ? { ...picture, image: picture.image as unknown as CanvasImageSource } : undefined;
      },
    });
    mount(SRCS, [OFFICE]);
    expect(canvas.frames).toEqual([SRCS.map((src) => ({ src, x: 200, y: 0, width: 400, height: 300, alpha: 1 }))]);
    expect(canvasOf(span)).not.toBeNull();
    expect(loads).toEqual([]);
  });

  test("the asset cache inspects only files loaded as layer files, and a line waiting on a file it first loaded as a plain image waits for that file's inspection", async () => {
    const inspected: string[] = [];
    const cache = new AssetCache({
      createImage: () => {
        const target = { onload: null, onerror: null, naturalWidth: 40, naturalHeight: 30 } as unknown as ImageTarget;
        Object.defineProperty(target, "src", {
          set: () => queueMicrotask(() => target.onload?.call(target, {})),
        });
        return target;
      },
      inspectImage: async (src) => {
        inspected.push(src);
        if (src === "single.png") await new Promise((resolve) => setTimeout(resolve, 30));
        return { animated: src === "gif.png", profile: false };
      },
    });
    await cache.request(
      [
        { kind: "image", src: "single.png" },
        { kind: "image", src: "gif.png", layer: true },
      ],
      0,
      "line",
      undefined,
    );
    expect(inspected).toEqual(["gif.png"]);
    expect(cache.picture("single.png")).toBeUndefined();
    expect(cache.picture("gif.png")).toMatchObject({ animated: true, width: 40, height: 30 });
    const result = await cache.request(
      [
        { kind: "image", src: "single.png", layer: true },
        { kind: "image", src: "gif.png", layer: true },
      ],
      0,
      "next",
      undefined,
    );
    expect(result.loaded).toEqual(["single.png", "gif.png"]);
    expect(cache.picture("single.png")).toMatchObject({ animated: false, profile: false, width: 40, height: 30 });
    expect(inspected).toEqual(["gif.png", "single.png"]);
  });

  test("a line waiting on a file promoted to a layer file stops waiting for its inspection after the load timeout, and the file is not yet a resident picture", async () => {
    let release: (() => void) | undefined;
    const cache = new AssetCache(
      {
        createImage: () => {
          const target = { onload: null, onerror: null, naturalWidth: 40, naturalHeight: 30 } as unknown as ImageTarget;
          Object.defineProperty(target, "src", {
            set: () => queueMicrotask(() => target.onload?.call(target, {})),
          });
          return target;
        },
        inspectImage: () =>
          new Promise((resolve) => {
            release = () => resolve({ animated: false, profile: false });
          }),
      },
      { loadTimeoutMs: 30 },
    );
    await cache.request([{ kind: "image", src: "plain.png" }], 0, "plain", undefined);
    const started = Date.now();
    const result = await cache.request([{ kind: "image", src: "plain.png", layer: true }], 0, "layer", undefined);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(result.loaded).toEqual(["plain.png"]);
    expect(cache.picture("plain.png")).toBeUndefined();
    release!();
    await until(() => !!cache.picture("plain.png"), "the late inspection");
  });

  test("a file asked for as a layer file after its plain load decoded, but before it became resident, is inspected before that request resolves", async () => {
    const inspected: string[] = [];
    let second: Promise<unknown> | undefined;
    const cache = new AssetCache({
      createImage: () => {
        const target = { onload: null, onerror: null, naturalWidth: 40, naturalHeight: 30 } as unknown as ImageTarget;
        Object.defineProperty(target, "src", {
          set: () =>
            queueMicrotask(() => {
              target.onload?.call(target, {});
              second = cache.request([{ kind: "image", src: "plain.png", layer: true }], 0, "layer", undefined);
            }),
        });
        return target;
      },
      inspectImage: async (src) => {
        inspected.push(src);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { animated: false, profile: false };
      },
    });
    const first = await cache.request([{ kind: "image", src: "plain.png" }], 0, "plain", undefined);
    expect(first.loaded).toEqual(["plain.png"]);
    expect(second).toBeDefined();
    const result = (await second) as { loaded: string[] };
    expect(result.loaded).toEqual(["plain.png"]);
    expect(inspected).toEqual(["plain.png"]);
    expect(cache.picture("plain.png")).toMatchObject({ animated: false, profile: false, width: 40, height: 30 });
  });
});
