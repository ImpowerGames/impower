import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { pictureFileTraits } from "../../app/morph/pictureFileTraits";
import { cssWithoutComments, fittedSvgLayer, readSvgLayer, type SvgLayerRaster } from "../../app/morph/svgLayerFile";
import { flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

const NS = "http://www.w3.org/2000/svg";
const text = (value: string) => new TextEncoder().encode(value);
const SVG = `<svg xmlns="${NS}" width="260" height="140" viewBox="0 0 200 100" preserveAspectRatio="xMa&#120;YMid meet"><rect width="10" height="10"/></svg>`;

interface Deferred {
  width: number;
  height: number;
  resolve(raster: SvgLayerRaster | undefined): void;
}

function picture(svg: Partial<PictureBitmap>, rasterize: (width: number, height: number) => Promise<SvgLayerRaster | undefined>) {
  const env = installJSDOM();
  restore = env.restore;
  const artwork =
    `<svg xmlns="${NS}" viewBox="0 0 100 100">` +
    '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
    '<image data-name="brows" data-layer="1" x="0" y="0" width="100" height="100"/>' +
    '<image data-name="hair" data-layer="2" x="0" y="0" width="100" height="100"/></svg>';
  const recipe = serializeMorphRecipe(
    buildMorphRecipe("m", { blend: "cut", keyframes: [{ offset: 0, brows: { translate: "0px" } }, { offset: 1, brows: { translate: "0 8px" } }] } as never),
  );
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { m: recipe }, variants: {} }),
    readSource: async () => ({ text: artwork }),
  });
  const frames = new Map<HTMLCanvasElement, string[][]>();
  const playback = new MorphPlayback(env.overlay, {
    host,
    seed: "s",
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: (element) => {
      const record: string[][] = [];
      frames.set(element, record);
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          record.push([]);
        },
        drawImage: (image) => {
          record.at(-1)!.push((image as unknown as { src: string }).src);
        },
      };
      return context;
    },
    loadPicture: async (src) => ({ image: { src } as never, width: 260, height: 140, animated: false, profile: false, ...(src.endsWith(".svg") ? svg : {}) }),
    rasterizeSvgLayer: (_source, _natural, width, height) => rasterize(width, height),
    animate: () => ({ sample: () => {}, cancel: () => {} }),
    readPose: () => ({ matrix: [1, 0, 0, 1, 0, 8], opacity: 1 }),
  });
  const still = vi.fn();
  playback.reportStill = still;
  const span = env.overlay.ownerDocument.createElement("span");
  const background = 'url("/hair.png"), url("/brows.svg"), url("/base.png")';
  span.style.setProperty("background-image", background);
  span.style.setProperty("background-size", "100% 100%");
  span.style.setProperty("background-repeat", "no-repeat");
  span.style.setProperty("width", "520px");
  span.style.setProperty("height", "420px");
  env.overlay.appendChild(span);
  const timing = { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as const;
  playback.mount(
    span,
    {
      plays: [
        {
          layer: 0,
          picture: { span: 3, files: ["/base.png", "/brows.svg", "/hair.png"].map((src) => ({ src, name: src.slice(1) })) },
          ref: { morphs: ["m"], key: "kit", image: "kit", selection: "{}", groups: [] },
          morph: "m",
          timing,
          motion: { brows: [{ offset: 0, values: { translate: "0px" } }, { offset: 1, values: { translate: "0 8px" } }] },
          definition: "d",
        },
      ],
      epoch: 0,
    },
    background,
    "background",
    "portrait:0",
  );
  const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const canvas = () => shadow()?.querySelector("canvas") as HTMLCanvasElement | null | undefined;
  const drawn = () => frames.get(canvas()!)!.at(-1);
  const resize = async (width: number, height: number) => {
    span.style.setProperty("width", `${width}px`);
    span.style.setProperty("height", `${height}px`);
    playback.requestRelayout();
    await flushMicrotasks(5);
  };
  return { playback, span, shadow, canvas, drawn, resize, still };
}

const raster = (width: number, height: number) => ({ image: { src: `raster ${width}x${height}` } as never, release: vi.fn() });

async function settle(check: () => boolean) {
  for (let i = 0; i < 2000 && !check(); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await flushMicrotasks(5);
}

describe("an SVG layer file without plays of its own is rasterized at the canvas's size, fitted by the browser, and drawn on the canvas with the other layers (#2631, #2757)", () => {
  test("an SVG, whatever precedes or decorates its root, is read as an SVG layer, and the raster formats and unknown binary files are not", async () => {
    expect(await pictureFileTraits(text(SVG))).toEqual({ animated: false, profile: false, svg: true });
    expect(await pictureFileTraits(text(`<?xml version="1.0"?><!-- ${"x".repeat(4100)} -->${SVG}`))).toMatchObject({ svg: true });
    expect(await pictureFileTraits(text(`﻿ \n<!-- <svg preserveAspectRatio="none"> -->${SVG}`))).toMatchObject({ svg: true });
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    expect((await pictureFileTraits(png)).svg).toBeUndefined();
    expect((await pictureFileTraits(Uint8Array.from([0, 0, 0, 24, ...text("ftypavif")]))).svg).toBeUndefined();
    expect((await pictureFileTraits(Uint8Array.from([0x42, 0x4d, 0, 0, 0, 0]))).svg).toBeUndefined();
  });

  test("an SVG is refused when it animates, has no size to fit by, or does not parse as an SVG, and is otherwise kept as written", () => {
    const env = installJSDOM();
    restore = env.restore;
    const view = env.overlay.ownerDocument.defaultView!;
    const read = (value: string) => readSvgLayer(value, new view.DOMParser());
    expect(read(SVG)).toEqual({ source: { text: SVG, viewBox: true } });
    expect(read(`<!-- <svg preserveAspectRatio="none"> -->${SVG}`)).toMatchObject({ source: { viewBox: true } });
    expect(read(`<svg xmlns="${NS}" width="2in" height="1in"/>`)).toMatchObject({ source: { viewBox: false } });
    expect(read(`<svg xmlns="${NS}" width="100%" height="140"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="260"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="auto" height="auto"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="calc(100%)" height="calc(100%)"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="0" height="140"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="2.6e2" height="+140px"/>`)).toMatchObject({ source: { viewBox: false } });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>/* @keyframes old { to { opacity: 0 } } */ rect { fill: blue }</style></svg>`)).toMatchObject({ source: { viewBox: true } });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><rect style="fill: red; /* animation: spin 1s */"/></svg>`)).toMatchObject({ source: { viewBox: true } });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>/* old */ rect { animation: spin 1s }</style></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>rect { font-family: "/*" } rect { animation: spin 1s }</style></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>rect { fill: url(a/*) } rect { animation: spin 1s }</style></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" width="1e309" height="1e309"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" width="1e39" height="140"/>`)).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1" style="padding:2px"/>`)).toEqual({ reason: "framed" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>svg { border: 1px solid }</style></svg>`)).toEqual({ reason: "framed" });
    const sized = (natural: { width: number; height: number }) => readSvgLayer(`<svg xmlns="${NS}" width="1in" height="140"/>`, new view.DOMParser(), { natural });
    expect(sized({ width: 96, height: 140 })).toMatchObject({ source: { viewBox: false } });
    expect(sized({ width: 300, height: 150 })).toEqual({ reason: "unsized" });
    expect(sized({ width: 0, height: 0 })).toEqual({ reason: "unsized" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><rect><animate attributeName="x" to="1" dur="1s"/></rect></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><set attributeName="x" to="1"/></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><style>@keyframes spin { to { rotate: 1turn } }</style></svg>`)).toMatchObject({ source: { viewBox: true } });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><rect style="fill:red; animation: spin 1s"/></svg>`)).toEqual({ reason: "animated" });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><rect style="transition: fill 1s"/></svg>`)).toMatchObject({ source: { viewBox: true } });
    expect(read(`<svg xmlns="${NS}" viewBox="0 0 1 1"><rect></svg>`)).toEqual({ reason: "unread" });
    expect(read(`<html xmlns="http://www.w3.org/1999/xhtml"/>`)).toEqual({ reason: "unread" });
  });

  test("CSS comments are removed outside strings, escapes and url tokens only", () => {
    expect(cssWithoutComments('a { b: "/*" } /* c */ d')).toBe('a { b: "/*" }   d');
    expect(cssWithoutComments("a { b: url(x/*y) } /* c")).toBe("a { b: url(x/*y) }  ");
    expect(cssWithoutComments("a { b: url( '/*' ) } e")).toBe("a { b: url( '/*' ) } e");
    expect(cssWithoutComments("a\\/* b */c")).toBe("a\\/* b */c");
    expect(cssWithoutComments("curl(/*x*/)")).toBe("curl( )");
  });

  test("the fitted copy takes the canvas's size, keeps the file's own viewBox and alignment, and stretches a file without a viewBox as CSS does", () => {
    const env = installJSDOM();
    restore = env.restore;
    const view = env.overlay.ownerDocument.defaultView!;
    const fit = (value: string, viewBox: boolean) =>
      new view.DOMParser().parseFromString(fittedSvgLayer({ text: value, viewBox }, { width: 100, height: 50 }, 375, 188, new view.DOMParser(), new view.XMLSerializer())!, "image/svg+xml").documentElement;
    const kept = fit(SVG, true);
    expect([kept.getAttribute("width"), kept.getAttribute("height"), kept.getAttribute("viewBox"), kept.getAttribute("preserveAspectRatio")]).toEqual(["375", "188", "0 0 200 100", "xMaxYMid meet"]);
    expect(kept.querySelector("rect")).not.toBeNull();
    const stretched = fit(`<svg xmlns="${NS}" width="2in" height="1in"><rect width="1" height="1"/></svg>`, false);
    expect([stretched.getAttribute("width"), stretched.getAttribute("height"), stretched.getAttribute("viewBox"), stretched.getAttribute("preserveAspectRatio")]).toEqual(["375", "188", "0 0 100 50", "none"]);
    const styled = fit(`<svg xmlns="${NS}" width="100" height="100" viewBox="0 0 100 100" style="width:100px;height:100px"><style>svg { width: 100px }</style></svg>`, true);
    expect(styled.getAttribute("style")).toBe(
      "width:100px;height:100px;width:375px !important;height:188px !important;min-width:0 !important;min-height:0 !important;max-width:none !important;max-height:none !important;margin:0 !important",
    );
  });

  test("a layer disposed while its first raster decodes releases that raster when it arrives, and never draws it", async () => {
    const pending: Deferred[] = [];
    const late = raster(260, 140);
    const { playback, span, canvas } = picture({ vector: { text: SVG, viewBox: true } }, (width, height) => new Promise((resolve) => pending.push({ width, height, resolve })));
    await settle(() => pending.length >= 1);
    playback.releaseWithin(span);
    pending[0]!.resolve(late);
    await flushMicrotasks(10);
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(canvas()).toBeFalsy();
    expect(pending).toHaveLength(1);
  });

  test("the SVG layer is drawn on the canvas between the raster layers, first from a raster at the picture's size and then from one at the canvas's size, with no element of its own", async () => {
    const calls: string[] = [];
    const { shadow, canvas, drawn } = picture({ vector: { text: SVG, viewBox: true } }, async (width, height) => {
      calls.push(`${width}x${height}`);
      return raster(width, height);
    });
    await settle(() => !!canvas() && calls.length >= 2);
    expect(calls).toEqual(["260x140", "520x420"]);
    expect(shadow()!.querySelector("img")).toBeNull();
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    expect(drawn()).toEqual(["/base.png", "raster 520x420", "/hair.png"]);
  });

  test("a resize keeps drawing the old raster until the new one has decoded, starts one decode at a time for the latest size, and dispose releases the raster", async () => {
    const pending: Deferred[] = [];
    const made: ReturnType<typeof raster>[] = [];
    const { playback, span, canvas, drawn, resize } = picture({ vector: { text: SVG, viewBox: true } }, (width, height) =>
      width === 260
        ? Promise.resolve(raster(width, height))
        : new Promise((resolve) => pending.push({ width, height, resolve })),
    );
    await settle(() => !!canvas() && pending.length >= 1);
    const answer = (at: number) => {
      const { width, height, resolve } = pending[at]!;
      made.push(raster(width, height));
      resolve(made.at(-1));
    };
    expect(drawn()).toEqual(["/base.png", "raster 260x140", "/hair.png"]);
    answer(0);
    await flushMicrotasks(5);
    expect(drawn()).toEqual(["/base.png", "raster 520x420", "/hair.png"]);
    await resize(400, 300);
    await resize(300, 200);
    await resize(600, 500);
    expect(pending.map(({ width, height }) => `${width}x${height}`)).toEqual(["520x420", "400x300"]);
    expect(drawn()).toEqual(["/base.png", "raster 520x420", "/hair.png"]);
    expect(canvas()!.width).toBe(600);
    answer(1);
    await flushMicrotasks(5);
    expect(pending.map(({ width, height }) => `${width}x${height}`)).toEqual(["520x420", "400x300", "600x500"]);
    expect(made[0]!.release).toHaveBeenCalledTimes(1);
    expect(drawn()).toEqual(["/base.png", "raster 400x300", "/hair.png"]);
    answer(2);
    await flushMicrotasks(5);
    expect(made[1]!.release).toHaveBeenCalledTimes(1);
    expect(drawn()).toEqual(["/base.png", "raster 600x500", "/hair.png"]);
    expect(made[2]!.release).not.toHaveBeenCalled();
    playback.releaseWithin(span);
    expect(made[2]!.release).toHaveBeenCalledTimes(1);
  });

  test.for([
    ["an animated SVG", { animated: true }, "animated"],
    ["an SVG that does not parse", { unread: true }, "unread"],
    ["an SVG without a viewBox or a size", { unsized: true }, "unsized"],
    ["an SVG whose root has padding or a border", { framed: true }, "framed"],
  ] as const)("%s keeps the picture on its CSS drawing, and the game is told which file", async ([, flags, reason]) => {
    const rasterize = vi.fn(async (width: number, height: number) => raster(width, height));
    const { canvas, still } = picture(flags, rasterize);
    await settle(() => still.mock.calls.length > 0);
    expect(still).toHaveBeenCalledWith({ image: "kit", file: "brows.svg", reason });
    expect(canvas()).toBeFalsy();
    expect(rasterize).not.toHaveBeenCalled();
  });

  test("an SVG the browser will not draw at the picture's size keeps the picture on its CSS drawing, and the game is told which file", async () => {
    const { canvas, still } = picture({ vector: { text: SVG, viewBox: true } }, async () => undefined);
    await settle(() => still.mock.calls.length > 0);
    expect(still).toHaveBeenCalledWith({ image: "kit", file: "brows.svg", reason: "undrawn" });
    expect(canvas()).toBeFalsy();
  });
});
