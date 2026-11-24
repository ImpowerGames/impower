import { afterEach, describe, expect, test, vi } from "vitest";
import { MorphPlayback, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const P = "inmemory:///assets/Images";

const file = (path: string) => {
  const leaf = path.slice(path.lastIndexOf("/") + 1);
  return { uri: `${P}/${path}`, type: "image", name: leaf.slice(0, leaf.lastIndexOf(".")), ext: "png", src: `/src/${path}` };
};

const FILES = [file("ava.png"), file("ava mouth.closed default.png"), file("ava mouth.open.png"), file("sky.png")];

const SOURCE = `scene start
  HERO:
    [[show portrait ava]]
    Line one.
  HERO:
    [[show portrait ava:open]]
    Line two.
  HERO:
    [[show portrait sky]]
    Line three.
end
`;

const lineOf = (text: string) => SOURCE.split("\n").findIndex((line) => line.includes(text));

let cleanup: (() => void) | undefined;
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function recordingCanvas() {
  const frames: string[][] = [];
  const context: PictureCanvasContext = {
    globalAlpha: 1,
    imageSmoothingEnabled: true,
    setTransform: () => {},
    clearRect: () => {
      frames.push([]);
    },
    drawImage(image) {
      frames.at(-1)!.push((image as unknown as { src: string }).src);
    },
  };
  return { frames, factory: () => context };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function harness() {
  const h = createDOMHarness(SOURCE, 0, { files: FILES as never });
  await h.ready;
  const canvas = recordingCanvas();
  MorphPlayback.for(h.overlay).configure({
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: canvas.factory,
    loadPicture: async (src) => ({ image: { src } as never, width: 40, height: 30 }),
  });
  cleanup = () => h.ui.onDispose();
  const portrait = () => {
    const spans = Array.from(h.overlay.querySelectorAll(".portrait .image > .instance")) as HTMLElement[];
    return spans.at(-1);
  };
  const canvasIn = (span: HTMLElement | undefined) => span?.querySelector("span.morph")?.shadowRoot?.querySelector("canvas") ?? null;
  const show = async (text: string) => {
    await h.preview(lineOf(text));
    const span = portrait();
    span?.style.setProperty("width", "400px");
    span?.style.setProperty("height", "300px");
    await flushMicrotasks(20);
    return span;
  };
  return { h, canvas, portrait, canvasIn, show };
}

describe("an image write of a still layered picture draws it on a canvas in the player (#2656)", () => {
  test("the write's picture is drawn on a canvas bottom first, and a change of look draws the new layers on a new canvas", async () => {
    const { canvas, canvasIn, show } = await harness();
    const first = await show("Line one.");
    expect(first?.getAttribute("image")).toBe("ava");
    await until(() => !!canvasIn(first), "the first canvas");
    expect(first!.style.getPropertyValue("background-image")).toBe("none");
    expect(canvas.frames).toEqual([["/src/ava.png", "/src/ava mouth.closed default.png"]]);
    const second = await show("Line two.");
    expect(second).not.toBe(first);
    await until(() => !!canvasIn(second), "the second canvas");
    expect(canvas.frames.at(-1)).toEqual(["/src/ava.png", "/src/ava mouth.open.png"]);
  });

  test("a single image keeps its CSS background and gets no canvas", async () => {
    const { canvas, portrait, canvasIn, show } = await harness();
    await show("Line three.");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(portrait()!.style.getPropertyValue("background-image")).toBe('url("/src/sky.png")');
    expect(canvasIn(portrait())).toBeNull();
    expect(canvas.frames).toEqual([]);
  });
});
