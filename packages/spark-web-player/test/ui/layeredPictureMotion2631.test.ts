import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { morphMotionKeyframes, type MorphMotion } from "@impower/sparkdown/src/morph/motion";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphRef, MorphTiming } from "@impower/sparkdown/src/morph/types";
import { MorphPlayback, type MorphImageContent, type PictureCanvasContext, type PictureCanvasFactory } from "../../src/app/morph/MorphPlayback";
import type { MotionPose } from "../../src/app/morph/motionPose";
import { installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

const FILES = ["base", "brows", "lids"];

const CONTEXT = {
  image: Object.fromEntries(FILES.map((name) => [name, { $type: "image", $name: name, src: `${name}.png`, uri: `file:///${name}.png` }])),
  layered_image: {
    kit: {
      $type: "layered_image",
      $name: "kit",
      assets: { base: { $name: "base" }, brows: { $name: "brows" }, "lids.on": { $name: "lids" } },
    },
  },
};

const BACKGROUND = 'url("brows.png"), url("base.png")';

const MOTION: MorphMotion = {
  brows: [
    { offset: 0, values: { translate: "0px" } },
    { offset: 0.5, values: { translate: "0 8px" } },
    { offset: 1, values: { translate: "0px" } },
  ],
};

const recipe = (paints?: unknown[]) =>
  serializeMorphRecipe(
    buildMorphRecipe("m", {
      blend: "cut",
      keyframes: [
        { offset: 0, lids: { state: "off" } },
        { offset: 0.5, lids: { state: "on" }, brows: { translate: "0 8px" } },
        { offset: 1, lids: { state: "off" } },
      ],
      ...(paints ? { paints } : {}),
    } as never),
  );

const timing: MorphTiming = { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" };

const content = (): MorphImageContent => {
  const ref: MorphRef = { morphs: ["m"], key: "kit-brows", image: "kit", selection: "{}", groups: ["lids"] };
  return {
    plays: [
      {
        layer: 0,
        picture: { span: 2, files: FILES.map((name) => ({ src: `${name}.png`, name: `${name}.png` })) },
        ref,
        morph: "m",
        timing,
        motion: MOTION,
        definition: "d",
      },
    ],
    epoch: 0,
  };
};

interface Painted {
  src: string;
  alpha: number;
  transform: number[];
  size: [number, number];
}

function recordingCanvas() {
  const frames: Painted[][] = [];
  let transform = [1, 0, 0, 1, 0, 0];
  const context: PictureCanvasContext = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setTransform: (...values) => {
      transform = values;
    },
    clearRect: () => {
      frames.push([]);
    },
    drawImage(image, _x, _y, width, height) {
      frames.at(-1)!.push({ src: (image as unknown as { src: string }).src, alpha: context.globalAlpha, transform, size: [width, height] });
    },
  };
  return { frames, factory: () => context };
}

const POSE: MotionPose = { matrix: [1, 0, 0, 1, 0, 8], opacity: 0.5 };

function setup(recipeText: string, options: { source?: string; pictureCanvas?: PictureCanvasFactory; pose?: MotionPose } = {}) {
  const env = installJSDOM();
  restore = env.restore;
  const host = createMorphHost({
    service: new MorphBakeService(),
    channel: () => ({ recipes: { m: recipeText }, variants: {} }),
    readSource: options.source === undefined ? layeredMorphSource(() => CONTEXT as never) : async () => ({ text: options.source! }),
  });
  const canvas = recordingCanvas();
  const effects: { element: Element; keyframes: Keyframe[]; samples: number[]; cancels: number }[] = [];
  const reads: { element: Element; box: { width: number; height: number } }[] = [];
  const playback = new MorphPlayback(env.overlay, {
    host,
    seed: "s",
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: options.pictureCanvas ?? canvas.factory,
    loadPicture: async (src) => ({ image: { src } as never, width: 40, height: 30 }),
    animate: (element, keyframes) => {
      const effect = { element, keyframes, samples: [] as number[], cancels: 0 };
      effects.push(effect);
      return { sample: (offset) => effect.samples.push(offset), cancel: () => (effect.cancels += 1) };
    },
    readPose: (element, box) => {
      reads.push({ element, box });
      return options.pose ?? POSE;
    },
  });
  const span = env.overlay.ownerDocument.createElement("span");
  span.style.setProperty("background-image", BACKGROUND);
  env.overlay.appendChild(span);
  return { playback, span, canvas, effects, reads };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const canvasOf = (span: HTMLElement) => span.querySelector("span.morph")?.shadowRoot?.querySelector("canvas") ?? null;

describe("a morph moves the layers of a picture made of image files on its canvas (#2631)", () => {
  test("the stand-in gets one effect with the label's keyframes, and the layer is drawn with the pose read from it", async () => {
    const { playback, span, canvas, effects, reads } = setup(recipe());
    playback.mount(span, content(), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    const element = canvasOf(span)!;
    playback.advance(0.5);
    playback.advance(0.1);
    expect(effects).toHaveLength(1);
    const standIn = effects[0]!.element as HTMLElement;
    expect(standIn.style.width).toBe("40px");
    expect(standIn.style.height).toBe("30px");
    expect(standIn.parentElement?.style.visibility).toBe("hidden");
    expect(effects[0]!.keyframes).toEqual(morphMotionKeyframes(MOTION["brows"]!));
    expect(effects[0]!.samples).toEqual([0, 0.5, 0.6]);
    expect(reads.every((read) => read.element === standIn && read.box.width === 40 && read.box.height === 30)).toBe(true);
    const sy = element.height / 30;
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1, transform: [1, 0, 0, 1, 0, 0], size: [element.width, element.height] },
      { src: "brows.png", alpha: 0.5, transform: [1, 0, 0, 1, 0, sy * 8], size: [element.width, element.height] },
      { src: "lids.png", alpha: 1, transform: [1, 0, 0, 1, 0, 0], size: [element.width, element.height] },
    ]);
  });

  test("a rest frame cancels the stand-in's effect and draws the layer unmoved", async () => {
    const { playback, span, canvas, effects } = setup(recipe());
    playback.mount(span, content(), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    const element = canvasOf(span)!;
    playback.advance(0.5);
    expect(effects[0]!.cancels).toBe(0);
    playback.setEnabled(false);
    expect(effects[0]!.cancels).toBeGreaterThan(0);
    expect(canvas.frames.at(-1)).toEqual([
      { src: "base.png", alpha: 1, transform: [1, 0, 0, 1, 0, 0], size: [element.width, element.height] },
      { src: "brows.png", alpha: 1, transform: [1, 0, 0, 1, 0, 0], size: [element.width, element.height] },
    ]);
  });

  test("a `paints` entry's opacity is drawn at its pose, multiplied with the moved pose's opacity", async () => {
    const { playback, span, canvas } = setup(recipe([{ targets: ["brows"], state: "lids.on", opacity: 0.25 }]));
    playback.mount(span, content(), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    playback.advance(0.5);
    const brows = canvas.frames.at(-1)!.find((painted) => painted.src === "brows.png")!;
    expect(brows.alpha).toBeCloseTo(0.125, 6);
    expect(canvas.frames.at(-1)!.map((painted) => painted.src)).toEqual(["base.png", "brows.png", "lids.png"]);
  });

  test("a faded label holding two files is drawn on a canvas of its own and faded once, as a whole", async () => {
    const source =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
      '<g data-name="brows"><image data-name="left" data-layer="1" x="0" y="0" width="100" height="100"/>' +
      '<image data-name="right" data-layer="2" x="0" y="0" width="100" height="100"/></g></svg>';
    const log: { canvas: number; src: string; alpha: number }[] = [];
    const canvases: HTMLCanvasElement[] = [];
    const factory: PictureCanvasFactory = (element) => {
      canvases.push(element);
      const index = canvases.length - 1;
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          if (index === 0) log.length = 0;
        },
        drawImage(image) {
          const drawn = canvases.indexOf(image as HTMLCanvasElement);
          log.push({ canvas: index, src: drawn >= 0 ? `canvas ${drawn}` : (image as unknown as { src: string }).src, alpha: context.globalAlpha });
        },
      };
      return context;
    };
    const fade = serializeMorphRecipe(buildMorphRecipe("m", { blend: "cut", keyframes: [{ offset: 0, brows: { opacity: "1" } }, { offset: 1, brows: { opacity: "50%" } }] } as never));
    const { playback, span } = setup(fade, { source, pictureCanvas: factory, pose: { matrix: [1, 0, 0, 1, 0, 0], opacity: 0.5 } });
    playback.mount(span, content(), BACKGROUND, "background", "portrait:0");
    await until(() => !!canvasOf(span), "the canvas");
    playback.advance(0.5);
    expect(log).toEqual([
      { canvas: 0, src: "base.png", alpha: 1 },
      { canvas: 1, src: "brows.png", alpha: 1 },
      { canvas: 1, src: "lids.png", alpha: 1 },
      { canvas: 0, src: "canvas 1", alpha: 0.5 },
    ]);
  });
});
