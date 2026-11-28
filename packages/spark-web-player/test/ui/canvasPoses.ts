import { vi } from "vitest";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../src/app/morph/MorphPlayback";
import { readSvgLayer } from "../../src/app/morph/svgLayerFile";

export interface Painted {
  src?: string;
  text?: string;
}

export interface CanvasPoses {
  paints: { canvas: HTMLCanvasElement; draws: Painted[] }[];
  rasterized: { src?: string; text?: string; size: string }[];
  loaded: string[];
  shownText(root?: ParentNode | null, rest?: MorphArtifact): string | undefined;
  shownTexts(root?: ParentNode | null, rest?: MorphArtifact): string[];
  shownDoc(root?: ParentNode | null, rest?: MorphArtifact): Document;
}

function leaves(text: string): string {
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  return JSON.stringify(
    Array.from(doc.querySelectorAll("[data-morph]")).map((element) => [
      element.getAttribute("data-morph"),
      !/display:\s*none/.test(element.getAttribute("style") ?? ""),
      element.getAttribute("d"),
    ]),
  );
}

export function showsPose(text: string | undefined, artifact: MorphArtifact, offsets: Record<string, number>): boolean {
  if (text === undefined) return false;
  const expected = leaves(renderMorphAt(artifact, offsets));
  if (!text.includes("data-morph")) return expected === leaves(renderMorphAt(artifact, {}));
  return leaves(text) === expected;
}

export function layOutPictures(doc: Document, box = { width: 400, height: 300 }, selector = ".image > .instance"): () => void {
  const win = doc.defaultView as Window & typeof globalThis;
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, value: 1 });
  const sheet = doc.createElement("style");
  sheet.textContent = `${selector} { width: ${box.width}px !important; height: ${box.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; }`;
  doc.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  const laidOut = (element: HTMLElement) => element.matches(selector);
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? box.width : 0; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? box.height : 0; } });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const across = laidOut(this) ? box.width : 0;
      const down = laidOut(this) ? box.height : 0;
      return { x: 0, y: 0, left: 0, top: 0, right: across, bottom: down, width: across, height: down, toJSON() {} };
    },
  });
  return () => {
    sheet.remove();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
    else delete (proto as unknown as Record<string, unknown>)["getBoundingClientRect"];
  };
}

export async function untilDrawn(playback: MorphPlayback, what = "the drawn poses") {
  const layers = () => [...(playback as unknown as { layers: Set<{ drawn: boolean; live: boolean }> }).layers];
  for (let i = 0; i < 2000; i++) {
    if (layers().length > 0 && layers().every((layer) => layer.drawn)) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

function decodeDataUrl(src: string): string | undefined {
  const match = /^data:([^,]*?)(;base64)?,(.*)$/s.exec(src);
  if (!match) return undefined;
  try {
    return match[2] ? atob(match[3]!) : decodeURIComponent(match[3]!);
  } catch {
    return undefined;
  }
}

function naturalSize(text: string): { width: number; height: number } | undefined {
  const root = new DOMParser().parseFromString(text, "image/svg+xml").documentElement;
  if (!root || root.localName !== "svg") return undefined;
  const width = Number.parseFloat(root.getAttribute("width") ?? "");
  const height = Number.parseFloat(root.getAttribute("height") ?? "");
  if (width > 0 && height > 0) return { width, height };
  const box = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number);
  if (box.length === 4 && box[2]! > 0 && box[3]! > 0) return { width: box[2]!, height: box[3]! };
  return undefined;
}

export function drawPosesOnCanvases(
  playback: MorphPlayback,
  options: {
    files?: { uri?: string; name?: string; ext?: string; data?: unknown }[];
    text?: (src: string) => string | undefined;
    frameRate?: number;
  } = {},
): CanvasPoses {
  if (options.frameRate !== undefined) {
    const rate = options.frameRate;
    Object.defineProperty(playback, "frameRate", { configurable: true, get: () => rate, set: () => {} });
  }
  Object.defineProperty(playback, "frameBudget", { configurable: true, get: () => () => Infinity, set: () => {} });
  const paints: CanvasPoses["paints"] = [];
  const rasterized: CanvasPoses["rasterized"] = [];
  const loaded: string[] = [];
  const byName = new Map<string, string>();
  for (const file of options.files ?? []) {
    if (typeof file.data !== "string") continue;
    const leaf = (file.uri ?? "").slice((file.uri ?? "").lastIndexOf("/") + 1);
    if (leaf) byName.set(leaf, file.data);
    if (file.name && file.ext) byName.set(`${file.name}.${file.ext}`, file.data);
  }
  const textOf = (src: string): string | undefined => {
    const own = options.text?.(src);
    if (own !== undefined) return own;
    const data = decodeDataUrl(src);
    if (data !== undefined) return data;
    const leaf = decodeURIComponent(src.split(/[?#]/)[0]!.slice(src.lastIndexOf("/") + 1));
    return byName.get(leaf);
  };
  const textOfImage = new Map<unknown, string>();
  playback.configure({
    pictureCanvas: (canvas) => {
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          paints.push({ canvas, draws: [] });
        },
        drawImage(image) {
          paints.at(-1)?.draws.push(image as unknown as Painted);
        },
      };
      return context;
    },
    loadPicture: async (src): Promise<PictureBitmap | undefined> => {
      loaded.push(src);
      const text = textOf(src);
      if (text === undefined) return undefined;
      const natural = naturalSize(text);
      const verdict = readSvgLayer(text, new DOMParser(), natural ? { natural } : {});
      if (!natural) return { image: { src } as never, width: 0, height: 0, unsized: true };
      if ("reason" in verdict) {
        return {
          image: { src } as never,
          ...natural,
          animated: verdict.reason === "animated",
          unread: verdict.reason === "unread",
          unsized: verdict.reason === "unsized",
          ...(verdict.reason === "styled" ? { styled: verdict.declaration } : {}),
        };
      }
      return { image: { src } as never, ...natural, vector: { ...verdict.source, src } as never };
    },
    rasterizeSvgLayer: (source, _natural, w, h) => {
      const src = (source as unknown as { src?: string }).src;
      const image: Painted = src ? { src } : { text: source.text };
      textOfImage.set(image, src ? (textOf(src) ?? "") : source.text);
      rasterized.push({ ...image, size: `${w}x${h}` });
      return Promise.resolve({ image: image as never, release: vi.fn() });
    },
  });
  const canvasesIn = (root?: ParentNode | null) => Array.from((root ?? document).querySelectorAll("canvas"));
  const shownTexts = (root?: ParentNode | null, rest?: MorphArtifact) =>
    canvasesIn(root).flatMap((canvas) => {
      const last = [...paints].reverse().find((paint) => paint.canvas === canvas);
      return (last?.draws ?? []).flatMap((draw) => {
        if (rest && draw.src !== undefined) return [renderMorphAt(rest, {})];
        const text = textOfImage.get(draw);
        return text === undefined ? [] : [text];
      });
    });
  return {
    paints,
    rasterized,
    loaded,
    shownTexts,
    shownText: (root, rest) => shownTexts(root, rest)[0],
    shownDoc: (root, rest) => new DOMParser().parseFromString(shownTexts(root, rest)[0] ?? "<svg xmlns='http://www.w3.org/2000/svg'/>", "image/svg+xml"),
  };
}
