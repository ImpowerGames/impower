import { describe, expect, test, vi } from "vitest";
import { createMorphHost, inlineMorphSource, type MorphHost } from "@impower/sparkdown/src/morph/hosts";
import { renderMorphAt } from "@impower/sparkdown/src/morph/render";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { MorphArtifact } from "@impower/sparkdown/src/morph/types";
import { talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import { MorphPlayback, type MorphImageContent, type PictureCanvasContext } from "../../src/app/morph/MorphPlayback";
import { createDOMHarness, flushMicrotasks, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const LIFT = `morph lift {
  blend = cut
  keyframes {
    from {
      lids {
        state = on
      }
    }
    50% {
      lids {
        state = on
      }
      face {
        translate = 10px 0
      }
      brows {
        translate = 0 8px
      }
    }
    to {
      lids {
        state = on
      }
    }
  }
  timing {
    duration = 2
    iterations = infinite
    easing = linear
  }
}
`;

const CHOMP = `morph chomp {
  blend = cut
  keyframes {
    from {
      mouth {
        state = open
      }
    }
    50% {
      mouth {
        state = closed
      }
    }
    to {
      mouth {
        state = open
      }
    }
  }
  timing {
    duration = 0.7
    iterations = infinite
    easing = linear
  }
}
`;

const source = (assets: string) => `${LIFT}
${CHOMP}
define kit as layered_image with
  assets = {
${assets}
  }
end

scene start
  HERO:
    [[show portrait kit]]
    First line.
end
`;

const COMPOSITED = source('    ["base"] = base_file,\n    ["brows"] = brows_file,\n    ["face"] = bunny,\n    ["lids.on"] = lids_file,');
const FALLBACK = source('    ["base"] = bunny,\n    ["brows"] = brows_file,\n    ["face"] = base_file,\n    ["lids.on"] = lids_file,');

const FILES = [
  { uri: "inmemory:///bunny.svg", type: "image", name: "bunny", ext: "svg", data: talkingPortrait() },
  { uri: "inmemory:///base_file.png", type: "image", name: "base_file", ext: "png", src: "/src/base_file.png" },
  { uri: "inmemory:///brows_file.png", type: "image", name: "brows_file", ext: "png", src: "/src/brows_file.png" },
  { uri: "inmemory:///lids_file.png", type: "image", name: "lids_file", ext: "png", src: "/src/lids_file.png" },
];

const POSE = { matrix: [1, 0.5, 0, 1, 4, 8] as [number, number, number, number, number, number], opacity: 0.5 };

function leafStates(root: ParentNode): Record<string, boolean[]> {
  const out: Record<string, boolean[]> = {};
  for (const el of Array.from(root.querySelectorAll("[data-morph]"))) {
    (out[el.getAttribute("data-morph")!] ??= []).push(!/display:\s*none/.test(el.getAttribute("style") ?? ""));
  }
  return out;
}

const referenceStates = (artifact: MorphArtifact, offset: Record<string, number>) =>
  leafStates(new DOMParser().parseFromString(renderMorphAt(artifact, offset), "image/svg+xml"));

const chompAt = (seconds: number) => ({ chomp: (seconds % 0.7) / 0.7 });

function inProcessHost(program: () => any): MorphHost {
  return createMorphHost({
    service: new MorphBakeService(),
    channel: () => program().morphs,
    readSource: inlineMorphSource(() => program().context),
  });
}

interface Painted {
  src: string;
  alpha: number;
  transform: number[];
  text?: string;
}

const textRasterizer = (source: { text: string; src?: string }) =>
  Promise.resolve({ image: { src: source.src ?? "pose", ...(source.src ? {} : { text: source.text }) } as never, release: () => {} });

function recordingCanvases() {
  const canvases = new Map<HTMLCanvasElement, { frames: Painted[][] }>();
  const factory = (element: HTMLCanvasElement) => {
    const record = { frames: [] as Painted[][] };
    canvases.set(element, record);
    let transform = [1, 0, 0, 1, 0, 0];
    const context: PictureCanvasContext = {
      globalAlpha: 1,
      imageSmoothingEnabled: true,
      setTransform: (...values) => {
        transform = values;
      },
      clearRect: () => {
        record.frames.push([]);
      },
      drawImage(image) {
        const drawn = image as unknown as { src: string; text?: string };
        record.frames.at(-1)!.push({ src: drawn.src, alpha: context.globalAlpha, transform, ...(drawn.text !== undefined ? { text: drawn.text } : {}) });
      },
    };
    return context;
  };
  return { canvases, factory };
}

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function shown(text: string, widthOf: (src: string) => number, withCanvas: boolean) {
  const writes: any[] = [];
  const h = createDOMHarness(text, 0, {
    files: FILES,
    afterEachMessage: (message) => {
      const ops = message?.method === "ui/batch" ? message.params.messages : [message];
      for (const op of ops) if (op?.method === "ui/write-image") writes.push(op);
    },
  });
  const host = inProcessHost(() => h.game.program);
  const canvas = recordingCanvases();
  const effects: { keyframes: Keyframe[]; samples: number[] }[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    host,
    seed: "test",
    requestFrame: () => 0,
    cancelFrame: () => {},
    pictureCanvas: canvas.factory,
    loadPicture: async (src) => ({ image: { src } as never, width: widthOf(src), height: 140 }),
    animate: (_element, keyframes) => {
      const effect = { keyframes, samples: [] as number[] };
      effects.push(effect);
      return { sample: (offset) => effect.samples.push(offset), cancel: () => {} };
    },
    readPose: () => POSE,
    rasterizeSvgLayer: (source) => textRasterizer(source as never),
  });
  await h.ready;
  await h.preview(text.split("\n").findIndex((line) => line.includes("First line.")));
  await flushMicrotasks(10);
  const span = h.overlay.querySelector(".portrait .image > .instance") as HTMLElement;
  const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
  const layer = () => (span as unknown as { __sdMorph?: { drawn: boolean; images: any[] } }).__sdMorph;
  await until(() => (withCanvas ? !!shadow()?.querySelector("canvas") : !!(layer() as { stills?: { undrawn?: unknown }[] } | undefined)?.stills?.[0]?.undrawn), "the SVG layer's drawing");
  const resize = async (width: number, height: number) => {
    span.style.setProperty("width", `${width}px`);
    span.style.setProperty("height", `${height}px`);
    playback.requestRelayout();
    await flushMicrotasks(5);
    if (withCanvas) await until(() => shadow()?.querySelector("canvas")?.width === width && !!layer()?.drawn && (layer()?.images[0]?.inner[0]?.poses?.sets.length ?? 0) > 0, "the SVG layer's poses at the new size");
  };
  span.style.setProperty("background-size", "100% 100%");
  span.style.setProperty("background-repeat", "no-repeat");
  await resize(520, 420);
  const write = writes.find((w) => w.params.target === "portrait" && w.params.instructions[0]?.content?.morph);
  const play = write.params.instructions[0].content.morph.plays[0];
  const own = play.picture.files.find((file: any) => file.plays)!.plays[0];
  const handle = await host.resolve(own.ref);
  const painted = () => (Array.from(shadow()!.querySelectorAll("canvas")) as HTMLCanvasElement[]).flatMap((element) => canvas.canvases.get(element)?.frames.at(-1) ?? []);
  const face = () => painted().filter(({ src }) => !src.startsWith("/src/"));
  const posed = () => {
    const [drawn, ...more] = face();
    expect(drawn).toBeDefined();
    expect(more).toEqual([]);
    return drawn!.text === undefined ? referenceStates(handle.artifact, {}) : leafStates(new DOMParser().parseFromString(drawn!.text, "image/svg+xml"));
  };
  return { playback, shadow, face, posed, artifact: handle.artifact, painted, play, effects, resize };
}

describe("a picture's morph moves its image-file layers while an SVG layer plays its own morph (#2631, #2632)", () => {
  test("composited: the moved files, the SVG layer among them, are drawn with their pose and fade on the picture's canvas, and the SVG layer's own morph keeps playing", async () => {
    const { playback, shadow, face, posed, artifact, painted, play, effects, resize } = await shown(COMPOSITED, () => 260, true);
    expect(play.morph).toBe("lift");
    expect(shadow()!.querySelectorAll("canvas")).toHaveLength(1);
    expect(shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
    playback.advance(1);
    expect(effects.map(({ keyframes }) => Object.keys(keyframes[1] ?? {}).filter((key) => key !== "offset"))).toEqual(
      expect.arrayContaining([["translate"], ["translate"]]),
    );
    const brows = painted().find(({ src }) => src === "/src/brows_file.png")!;
    expect(brows.transform).toEqual([1, 0.75, 0, 1, 8, 24]);
    expect(brows.alpha).toBeCloseTo(0.5, 6);
    expect(painted().find(({ src }) => src === "/src/base_file.png")!.transform).toEqual([1, 0, 0, 1, 0, 0]);
    expect(face()[0]!.transform).toEqual([1, 0.75, 0, 1, 8, 24]);
    expect(face()[0]!.alpha).toBeCloseTo(0.5, 6);
    const picture = shadow()!.querySelector("canvas")!.parentElement!;
    expect(picture.getAttribute("style")).toMatch(/^position:absolute;left:[\d.]+px;top:[\d.]+px;width:520px;height:420px;overflow:hidden$/);
    expect(posed()).toEqual(referenceStates(artifact, chompAt(1)));
    await resize(260, 210);
    playback.advance(0.3);
    expect(face()[0]!.transform).toEqual([1, 0.75, 0, 1, 4, 12]);
    expect(posed()).toEqual(referenceStates(artifact, chompAt(1.3)));
    expect(referenceStates(artifact, chompAt(1))).not.toEqual(referenceStates(artifact, chompAt(1.3)));
  });

  test("fallback: a picture whose files differ in size is not drawn, moves nothing, and draws no layer as inline SVG or CSS (#2817)", async () => {
    const { playback, shadow, effects } = await shown(FALLBACK, (src) => (src.endsWith(".png") ? 130 : 260), false);
    for (const seconds of [0.2, 0.3, 0.5]) {
      playback.advance(seconds);
      expect(shadow()!.querySelectorAll("canvas, svg, [data-morph]")).toHaveLength(0);
      expect(Array.from(shadow()!.children).map((child) => /background-image:\s*([^;]*)/.exec(child.getAttribute("style") ?? "")?.[1]).filter((image) => image && image !== "none")).toEqual([]);
    }
    expect(effects).toEqual([]);
    expect(Array.from(shadow()!.querySelectorAll("[style*='matrix']"))).toEqual([]);
  });
});

describe("a faded label holding an image-file layer and an SVG layer is faded once, as a group (#2631, #2632)", () => {
  const GROUPED =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
    '<g data-name="face">' +
    '<image data-name="shade" data-layer="1" x="0" y="0" width="100" height="100"/>' +
    '<image data-name="mask" data-layer="2" x="0" y="0" width="100" height="100"/></g></svg>';
  const timing = { duration: 1, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as const;

  test("the label's files, the SVG layer among them, are drawn together and faded once, and nothing inside is faded again", async () => {
    const env = installJSDOM();
    try {
      const chomp = serializeMorphRecipe(buildMorphRecipe("chomp", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "open" } }, { offset: 1, mouth: { state: "closed" } }] } as never));
      const fade = serializeMorphRecipe(buildMorphRecipe("fade", { blend: "cut", keyframes: [{ offset: 0, face: { opacity: "1" } }, { offset: 1, face: { opacity: "50%" } }] } as never));
      const host = createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { fade, chomp }, variants: {} }),
        readSource: async (ref) => ({ text: ref.key === "inner" ? talkingPortrait() : GROUPED }),
      });
      const canvas = recordingCanvases();
      const playback = new MorphPlayback(env.overlay, {
        host,
        seed: "s",
        requestFrame: () => 0,
        cancelFrame: () => {},
        pictureCanvas: canvas.factory,
        loadPicture: async (src) => ({ image: { src } as never, width: 260, height: 140 }),
        animate: () => ({ sample: () => {}, cancel: () => {} }),
        readPose: () => ({ matrix: [1, 0, 0, 1, 0, 0], opacity: 0.5 }),
        rasterizeSvgLayer: (source) => textRasterizer(source as never),
      });
      const span = env.overlay.ownerDocument.createElement("span");
      const background = 'url("/shade.png"), url("/base.png")';
      span.style.setProperty("background-image", background);
      env.overlay.appendChild(span);
      const content: MorphImageContent = {
        plays: [
          {
            layer: 0,
            picture: {
              span: 2,
              files: [
                { src: "/base.png", name: "base.png" },
                { src: "/shade.png", name: "shade.png" },
                {
                  src: "/mask.svg",
                  name: "mask.svg",
                  plays: [{ ref: { morphs: ["chomp"], key: "inner", image: "mask", selection: "{}", groups: ["mouth"] }, morph: "chomp", timing, definition: "c" }],
                },
              ],
            },
            ref: { morphs: ["fade"], key: "picture", image: "kit", selection: "{}", groups: [] },
            morph: "fade",
            timing,
            motion: { face: [{ offset: 0, values: { opacity: "1" } }, { offset: 1, values: { opacity: "0.5" } }] },
            definition: "f",
          },
        ],
        epoch: 0,
      };
      playback.mount(span, content, background, "background", "portrait:0");
      const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
      await until(() => !!shadow()?.querySelector("canvas"), "the picture and its SVG layer");
      playback.advance(1);
      expect(shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
      const shown = Array.from(shadow()!.querySelectorAll("canvas")) as HTMLCanvasElement[];
      expect(shown).toHaveLength(1);
      const group = [...canvas.canvases.keys()].find((element) => !element.isConnected)!;
      expect(canvas.canvases.get(shown[0]!)!.frames.at(-1)!.map(({ src, alpha }) => [src, alpha])).toEqual([
        ["/base.png", 1],
        [undefined, 0.5],
      ]);
      expect(canvas.canvases.get(group)!.frames.at(-1)!.map(({ src, alpha }) => [src, alpha])).toEqual([
        ["/shade.png", 1],
        ["/mask.svg", 1],
      ]);
    } finally {
      env.restore();
    }
  });

  test("a file moved inside a container is drawn with every wrapper's movement, so movements that cancel leave it whole, as on the canvas path", async () => {
    const NESTED =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
      '<image data-name="base" data-layer="0" x="0" y="0" width="100" height="100"/>' +
      '<g data-name="outer"><g data-name="inner">' +
      '<image data-name="shade" data-layer="1" x="0" y="0" width="100" height="100"/></g>' +
      '<image data-name="mask" data-layer="2" x="0" y="0" width="100" height="100"/></g></svg>';
    const env = installJSDOM();
    try {
      const chomp = serializeMorphRecipe(buildMorphRecipe("chomp", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "open" } }, { offset: 1, mouth: { state: "closed" } }] } as never));
      const shift = serializeMorphRecipe(
        buildMorphRecipe("shift", {
          blend: "cut",
          keyframes: [
            { offset: 0, outer: { translate: "0px" }, inner: { translate: "0px" } },
            { offset: 1, outer: { translate: "-40px 0" }, inner: { translate: "40px 0" } },
          ],
        } as never),
      );
      const host = createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { shift, chomp }, variants: {} }),
        readSource: async (ref) => ({ text: ref.key === "inner" ? talkingPortrait() : NESTED }),
      });
      const canvas = recordingCanvases();
      const moves = new Map<Element, number>();
      const playback = new MorphPlayback(env.overlay, {
        host,
        seed: "s",
        requestFrame: () => 0,
        cancelFrame: () => {},
        pictureCanvas: canvas.factory,
        loadPicture: async (src) => ({ image: { src } as never, width: 260, height: 140 }),
        animate: (element, keyframes) => {
          moves.set(element, JSON.stringify(keyframes).includes("-40px") ? -40 : 40);
          return { sample: () => {}, cancel: () => {} };
        },
        readPose: (element) => ({ matrix: [1, 0, 0, 1, moves.get(element) ?? 0, 0], opacity: 1 }),
        rasterizeSvgLayer: (source) => textRasterizer(source as never),
      });
      const span = env.overlay.ownerDocument.createElement("span");
      const background = 'url("/shade.png"), url("/base.png")';
      span.style.setProperty("background-image", background);
      span.style.setProperty("background-size", "100% 100%");
      span.style.setProperty("background-repeat", "no-repeat");
      span.style.setProperty("width", "520px");
      span.style.setProperty("height", "280px");
      env.overlay.appendChild(span);
      const track = (to: string) => [
        { offset: 0, values: { translate: "0px" } },
        { offset: 1, values: { translate: to } },
      ];
      const content: MorphImageContent = {
        plays: [
          {
            layer: 0,
            picture: {
              span: 2,
              files: [
                { src: "/base.png", name: "base.png" },
                { src: "/shade.png", name: "shade.png" },
                {
                  src: "/mask.svg",
                  name: "mask.svg",
                  plays: [{ ref: { morphs: ["chomp"], key: "inner", image: "mask", selection: "{}", groups: ["mouth"] }, morph: "chomp", timing, definition: "c" }],
                },
              ],
            },
            ref: { morphs: ["shift"], key: "picture", image: "kit", selection: "{}", groups: [] },
            morph: "shift",
            timing,
            motion: { outer: track("-40px 0"), inner: track("40px 0") },
            definition: "s",
          },
        ],
        epoch: 0,
      };
      playback.mount(span, content, background, "background", "portrait:0");
      const shadow = () => span.querySelector(":scope > span.morph")?.shadowRoot ?? null;
      const layer = () => (span as unknown as { __sdMorph?: { drawn: boolean; images: any[] } }).__sdMorph;
      await until(() => !!shadow()?.querySelector("canvas"), "the picture and its SVG layer");
      playback.requestRelayout();
      await flushMicrotasks(5);
      await until(() => !!layer()?.drawn && (layer()?.images[0]?.inner[0]?.poses?.sets.length ?? 0) > 0, "the SVG layer's poses");
      playback.advance(1);
      expect(shadow()!.querySelectorAll("[data-morph]")).toHaveLength(0);
      const shown = Array.from(shadow()!.querySelectorAll("canvas")) as HTMLCanvasElement[];
      expect(shown).toHaveLength(1);
      expect(canvas.canvases.get(shown[0]!)!.frames.at(-1)!.map(({ alpha, transform }) => [alpha, transform])).toEqual([
        [1, [1, 0, 0, 1, 0, 0]],
        [1, [1, 0, 0, 1, 0, 0]],
        [1, [1, 0, 0, 1, -80, 0]],
      ]);
    } finally {
      env.restore();
    }
  });
});
