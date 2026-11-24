import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import {
  MorphGroup,
  MorphPlayback,
  type MorphImageContent,
  type PictureBitmap,
  type PictureCanvasContext,
} from "../../app/morph/MorphPlayback";
import { installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

const FILES = ["base", "closed", "open", "lids"];

const CONTEXT = {
  image: Object.fromEntries(FILES.map((name) => [name, { $type: "image", $name: name, src: `${name}.png`, uri: `file:///${name}.png` }])),
  layered_image: {
    kit: {
      $type: "layered_image",
      $name: "kit",
      assets: {
        base: { $name: "base" },
        "mouth.closed default": { $name: "closed" },
        "mouth.open": { $name: "open" },
        "lids.on": { $name: "lids" },
      },
    },
  },
};

const BACKGROUND = 'url("closed.png"), url("base.png")';

const keyframes = (group: string, states: string[]) =>
  states.map((state, index) => ({ offset: index / (states.length - 1), [group]: { state } }));

const recipe = (blend: string, group: string, states: string[]) =>
  serializeMorphRecipe(buildMorphRecipe("m", { blend, keyframes: keyframes(group, states) } as never));

const timing: MorphTiming = { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" };

const content = (group: string): MorphImageContent => {
  const ref: MorphRef = { morphs: ["m"], key: `kit-${group}`, image: "kit", selection: "{}", groups: [group] };
  return {
    plays: [
      {
        layer: 0,
        picture: { span: 2, files: FILES.map((name) => ({ src: `${name}.png`, name: `${name}.png` })) },
        ref,
        morph: "m",
        timing,
        definition: "d",
      },
    ],
    epoch: 0,
  };
};

interface Painted {
  src: string;
  alpha: number;
}

function recordingCanvas() {
  const frames: Painted[][] = [];
  const context: PictureCanvasContext = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setTransform: () => {},
    clearRect: () => {
      frames.push([]);
    },
    drawImage(image) {
      frames.at(-1)!.push({ src: (image as unknown as { src: string }).src, alpha: context.globalAlpha });
    },
  };
  return { frames, factory: () => context };
}

function setup(recipeText: string, load?: (src: string) => Promise<PictureBitmap | undefined>, context: unknown = CONTEXT) {
  const env = installJSDOM();
  restore = env.restore;
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { m: recipeText }, variants: {} }),
    readSource: layeredMorphSource(() => context as never),
  });
  const canvas = recordingCanvas();
  const loads: string[] = [];
  const stills: unknown[] = [];
  const playback = new MorphPlayback(env.overlay, {
    host,
    seed: "s",
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: canvas.factory,
    loadPicture: async (src) => {
      loads.push(src);
      return load ? load(src) : { image: { src } as never, width: 40, height: 30 };
    },
  });
  playback.reportStill = (params) => stills.push(params);
  const span = env.overlay.ownerDocument.createElement("span");
  span.style.setProperty("background-image", BACKGROUND);
  env.overlay.appendChild(span);
  return { playback, span, canvas, loads, stills };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const canvasOf = (span: HTMLElement) => span.querySelector("span.morph")?.shadowRoot?.querySelector("canvas") ?? null;

describe("a picture made of image files is drawn on a canvas (#2629)", () => {
  test("under cut, the lids layer shows at offset 0.5 and not at offsets 0 and 1", async () => {
    const { playback, span, canvas } = setup(recipe("cut", "lids", ["off", "on", "off"]));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    const drawnAt = (seconds: number) => {
      playback.advance(seconds);
      return canvas.frames.at(-1);
    };
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 1 },
    ]);
    expect(drawnAt(0.5)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 1 },
      { src: "lids.png", alpha: 1 },
    ]);
    expect(drawnAt(0.6)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 1 },
    ]);
    expect(span.style.getPropertyValue("background-image")).toBe("none");
  });

  test("halfway through a fade both mouth layers are drawn at opacity 0.5", async () => {
    const { playback, span, canvas } = setup(recipe("fade", "mouth", ["closed", "open"]));
    playback.mount(span, content("mouth"), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    playback.advance(0.5);
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 0.5 },
      { src: "open.png", alpha: 0.5 },
    ]);
  });

  test("a layer file of another natural size keeps the picture still", async () => {
    const { playback, span, canvas, loads } = setup(recipe("cut", "lids", ["off", "on", "off"]), async (src) => ({
      image: { src } as never,
      width: src === "lids.png" ? 41 : 40,
      height: 30,
    }));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => loads.includes("lids.png"), "the layer files to load");
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(0.5);
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(BACKGROUND);
  });

  test("nothing is drawn on the canvas until every layer file the morph can show has decoded", async () => {
    const waiting = new Map<string, (bitmap: PictureBitmap) => void>();
    const { playback, span, canvas, loads } = setup(
      recipe("cut", "lids", ["off", "on", "off"]),
      (src) => new Promise((resolve) => waiting.set(src, resolve)),
    );
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => waiting.size === 3, "the decodes to start");
    expect(loads.sort()).toEqual(["base.png", "closed.png", "lids.png"]);
    for (const src of ["base.png", "closed.png"]) waiting.get(src)!({ image: { src } as never, width: 40, height: 30 });
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(0.5);
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(BACKGROUND);
    waiting.get("lids.png")!({ image: { src: "lids.png" } as never, width: 40, height: 30 });
    await until(() => !!canvasOf(span), "the canvas");
    expect(canvas.frames.at(-1)).toContainEqual({ src: "lids.png", alpha: 1 });
  });

  test("a picture with an animated layer file keeps its CSS background, and the game is told once which file", async () => {
    const { playback, span, canvas, stills, loads } = setup(recipe("cut", "lids", ["off", "on", "off"]), async (src) => ({
      image: { src } as never,
      width: 40,
      height: 30,
      ...(src === "lids.png" ? { animated: true } : {}),
    }));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => stills.length > 0, "the still report");
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(0.5);
    expect(loads).toContain("lids.png");
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(BACKGROUND);
    expect(stills).toEqual([{ image: "kit", file: "lids.png", reason: "animated" }]);
  });

  test("a layered picture used as a mask keeps its CSS mask and does not move", async () => {
    const { playback, span, canvas, loads } = setup(recipe("cut", "lids", ["off", "on", "off"]));
    span.style.setProperty("mask-image", BACKGROUND);
    const layer = playback.mount(span, content("lids"), BACKGROUND, "mask", "portrait:mask:0");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(layer.occurrenceKeys).toEqual([]);
    expect(loads).toEqual([]);
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("mask-image")).toBe(BACKGROUND);
  });

  test("a group update while a picture decodes waits for that decode, and the picture is drawn once it resolves", async () => {
    const waiting = new Map<string, ((bitmap: PictureBitmap) => void)[]>();
    const { playback, span, canvas } = setup(recipe("cut", "lids", ["off", "on", "off"]), (src) =>
      new Promise((resolve) => waiting.set(src, [...(waiting.get(src) ?? []), resolve])),
    );
    const group = new MorphGroup();
    const other = span.ownerDocument.createElement("span");
    other.style.setProperty("background-image", BACKGROUND);
    span.parentElement!.appendChild(other);
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0", group);
    playback.mount(other, content("lids"), BACKGROUND, "background", "portrait:1", group);
    await until(() => waiting.size === 3, "the decodes to start");
    playback.releaseWithin(other);
    await new Promise((resolve) => setTimeout(resolve, 20));
    for (const [src, resolvers] of waiting) for (const resolve of resolvers) resolve({ image: { src } as never, width: 40, height: 30 });
    await until(() => !!canvasOf(span), "the canvas");
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 1 },
    ]);
  });

  test("a layer file whose bytes cannot be read keeps the CSS background, and the game is told", async () => {
    const { playback, span, canvas, stills } = setup(recipe("cut", "lids", ["off", "on", "off"]), async (src) => ({
      image: { src } as never,
      width: 40,
      height: 30,
      ...(src === "closed.png" ? { unread: true } : {}),
    }));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => stills.length > 0, "the still report");
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(0.5);
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(BACKGROUND);
    expect(stills).toEqual([{ image: "kit", file: "closed.png", reason: "unread" }]);
  });
});

const sized = (width: number, height: number) => ({
  ...CONTEXT,
  image: Object.fromEntries(Object.entries(CONTEXT.image).map(([name, image]) => [name, { ...image, width, height }])),
});

describe("a picture's rectangle comes from the sizes the compiler wrote (#2630)", () => {
  test("layer files of the written size are drawn at that size", async () => {
    const { playback, span, canvas } = setup(recipe("cut", "lids", ["off", "on", "off"]), undefined, sized(40, 30));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1 },
      { src: "closed.png", alpha: 1 },
    ]);
  });

  test("layer files whose natural size differs from the written size keep the picture still", async () => {
    const { playback, span, canvas, loads } = setup(recipe("cut", "lids", ["off", "on", "off"]), undefined, sized(80, 60));
    playback.mount(span, content("lids"), BACKGROUND, "background", "portrait:0");
    await until(() => loads.includes("lids.png"), "the layer files to load");
    await new Promise((resolve) => setTimeout(resolve, 50));
    playback.advance(0.5);
    expect(canvasOf(span)).toBeNull();
    expect(canvas.frames).toEqual([]);
    expect(span.style.getPropertyValue("background-image")).toBe(BACKGROUND);
  });
});
