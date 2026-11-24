import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { MorphPlayback, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { pictureFileTraits } from "../../app/morph/pictureFileTraits";
import { flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

let restore: (() => void) | undefined;
afterEach(() => {
  restore?.();
  restore = undefined;
});

const text = (value: string) => new TextEncoder().encode(value);

describe("a layer file that is not a raster image is drawn as an image element, which the browser fits as CSS does (#2631, #2632)", () => {
  test("an SVG, whatever precedes or decorates its root, is an element file, and the raster formats are not", async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 200 100" preserveAspectRatio="xMa&#120;YMid meet"/>';
    expect(await pictureFileTraits(text(svg))).toEqual({ animated: false, profile: false, element: true });
    expect(await pictureFileTraits(text(`<?xml version="1.0"?><!-- ${"x".repeat(4100)} -->${svg}`))).toMatchObject({ element: true });
    expect(await pictureFileTraits(text(`<!-- <svg preserveAspectRatio="none"> -->${svg}`))).toMatchObject({ element: true });
    const png = Uint8Array.from(Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64"));
    expect((await pictureFileTraits(png)).element).toBeUndefined();
    expect((await pictureFileTraits(Uint8Array.from([0, 0, 0, 24, ...text("ftypavif")]))).element).toBeUndefined();
  });

  test("a moved element file is an image element in stacking order that takes the whole movement, and the canvas runs around it draw only raster files", async () => {
    const env = installJSDOM();
    restore = env.restore;
    const artwork =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
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
      loadPicture: async (src) => ({ image: { src } as never, width: 260, height: 140, ...(src.endsWith(".svg") ? { element: true } : {}) }),
      animate: () => ({ sample: () => {}, cancel: () => {} }),
      readPose: () => ({ matrix: [1, 0, 0, 1, 0, 8], opacity: 0.5 }),
    });
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
    for (let i = 0; i < 2000 && !shadow()?.querySelector("canvas"); i++) await new Promise((resolve) => setTimeout(resolve, 5));
    playback.requestRelayout();
    await flushMicrotasks(5);
    playback.advance(1);
    const picture = shadow()!.querySelector("canvas")!.parentElement!;
    const order = Array.from(picture.children, (child) =>
      child.tagName === "CANVAS" ? "canvas" : child.querySelector("img") ? "container" : (child.getAttribute("style") ?? "").includes("visibility:hidden") ? "stage" : child.tagName,
    );
    expect(order).toEqual(["canvas", "container", "canvas", "stage"]);
    const container = picture.children[1] as HTMLElement;
    expect(container.getAttribute("style")).toBe("position:absolute;inset:0;opacity:0.5");
    const image = container.querySelector("img")!;
    expect(image.getAttribute("src")).toBe("/brows.svg");
    expect(image.getAttribute("style")).toBe("position:absolute;left:0;top:0;width:100%;height:100%;transform-origin:0 0;transform:matrix(1, 0, 0, 1, 0, 24)");
    const canvases = Array.from(picture.querySelectorAll(":scope > canvas")) as HTMLCanvasElement[];
    expect(canvases.map((element) => frames.get(element)!.at(-1))).toEqual([["/base.png"], ["/hair.png"]]);
  });
});
