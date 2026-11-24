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
  const context: PictureCanvasContext = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setTransform: () => {},
    clearRect: () => {
      frames.push([]);
    },
    drawImage(image, x, y, width, height) {
      frames.at(-1)!.push({ src: (image as unknown as { src: string }).src, x, y, width, height, alpha: context.globalAlpha });
    },
  };
  return { frames, factory: () => context };
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
  const playback = new MorphPlayback(env.overlay, {
    requestFrame: () => 0,
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
  return { playback, span, canvas, loads, mount };
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
    expect(span.style.getPropertyValue("background-image")).toBe("none");
    expect(boxOf(span)!.getAttribute("style")).toBe("position:absolute;left:200px;top:0px;width:400px;height:300px");
    const element = canvasOf(span)!;
    expect([element.width, element.height]).toEqual([400, 300]);
    expect(canvas.frames).toEqual([
      SRCS.map((src) => ({ src, x: 0, y: 0, width: 400, height: 300, alpha: 1 })),
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
    expect(canvas.frames).toEqual([SRCS.map((src) => ({ src, x: 0, y: 0, width: 400, height: 300, alpha: 1 }))]);
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
    expect(ratios).toEqual(["", "40 / 30", "40 / 30", "40 / 30"]);
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
    expect(canvas.frames).toEqual([SRCS.map((src) => ({ src, x: 0, y: 0, width: 400, height: 300, alpha: 1 }))]);
    expect(canvasOf(span)).not.toBeNull();
    expect(loads).toEqual([]);
  });

  test("the asset cache inspects only files loaded as layer files", async () => {
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
    await cache.request([{ kind: "image", src: "single.png", layer: true }], 0, "next", undefined);
    await until(() => !!cache.picture("single.png"), "the late inspection");
    expect(inspected).toEqual(["gif.png", "single.png"]);
  });
});
