import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost, layeredMorphSource } from "@impower/sparkdown/src/morph/hosts";
import { buildMorphRecipe, serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import type { LayeredPicture, MorphImageContent, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureViewOf } from "../../../../spark-dom/src/utils/placePicture";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../app/morph/MorphPlayback";
import type { SvgLayerRaster } from "../../app/morph/svgLayerFile";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SHADOWS = 6;

const SOURCE = `layout main {
  stage {
    portrait {
${Array.from({ length: SHADOWS }, (_, i) => `      mask.shadow_${i + 1}`).join("\n")}
      image
    }
  }
  textbox {
    dialogue {
      text
    }
  }
}

scene start
  Nothing yet.
end
`;

const BOX = { width: 400, height: 300 };
const DPR = 2;
const HIDDEN = "linear-gradient(transparent, transparent)";

const SVG = { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 120"/>', viewBox: true };
const vector = (src: string): PictureBitmap => ({ image: { src } as never, width: 160, height: 120, vector: { ...SVG, src } as never });
const bitmap = (src: string): PictureBitmap => ({ image: { src } as never, width: 160, height: 120 });
const raster = (src: string, width: number, height: number): SvgLayerRaster => ({ image: { src: `raster ${src} ${width}x${height}` } as never, release: vi.fn() });

const css = (srcs: string[]) => [...srcs].reverse().map((src) => `url("${src}")`).join(", ");

const picture = (name: string, srcs: string[], vectorPicture = true): LayeredPicture => ({
  layer: 0,
  span: srcs.length,
  name,
  ...(vectorPicture ? { vector: true as const } : {}),
  files: srcs.map((src) => ({ src, name: src.slice(src.lastIndexOf("/") + 1) })),
});

const show = (name: string, srcs: string[], options: { vector?: boolean; morph?: MorphImageContent; pictures?: LayeredPicture[] } = {}): WriteImageParams => ({
  target: "portrait",
  instant: false,
  instructions: [
    {
      control: "show",
      content: {
        background: css(srcs),
        imageNames: name,
        srcs,
        pictures: options.pictures ?? [picture(name, srcs, options.vector ?? true)],
        ...(options.morph ? { morph: options.morph } : {}),
      },
    },
  ],
});

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

async function until(check: () => boolean, what: string) {
  for (let i = 0; i < 2000; i++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

async function setup(
  options: {
    refuse?: (src: string) => boolean;
    load?: (src: string) => Promise<PictureBitmap | undefined>;
    holdOutlines?: boolean;
  } = {},
) {
  const h = createDOMHarness(SOURCE, 0, { compose: true });
  await h.ready;
  await h.rerender(SOURCE, 0);
  await untilShown(h.overlay);
  const win = h.overlay.ownerDocument.defaultView as Window & typeof globalThis;
  const effect = (win as unknown as { KeyframeEffect: { prototype: Record<string, unknown> } }).KeyframeEffect.prototype;
  effect["getTiming"] ??= () => ({ delay: 0, duration: 0 });
  effect["getComputedTiming"] ??= () => ({ progress: 0, endTime: 0 });
  Object.defineProperty(win, "devicePixelRatio", { configurable: true, value: DPR });
  const sheet = win.document.createElement("style");
  sheet.textContent = `.image > .instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; } [style*="display: none"] .instance { width: auto !important; height: auto !important; }`;
  win.document.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const laidOut = (el: HTMLElement) => {
    for (let at: HTMLElement | null = el; at; at = at.parentElement) if (at.style.getPropertyValue("display") === "none") return false;
    return el.classList.contains("instance");
  };
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "offsetWidth", {
    configurable: true,
    get(this: HTMLElement) {
      return laidOut(this) ? BOX.width : 0;
    },
  });
  Object.defineProperty(proto, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return laidOut(this) ? BOX.height : 0;
    },
  });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const zoom = laidOut(this) ? pictureViewOf(this).zoom : 0;
      const across = BOX.width * zoom;
      const down = BOX.height * zoom;
      return { x: 0, y: 0, left: 0, top: 0, right: across, bottom: down, width: across, height: down, toJSON() {} };
    },
  });
  const events: string[] = [];
  const paints: { canvas: HTMLCanvasElement; draws: string[] }[] = [];
  const rasterized: string[] = [];
  const outlines: { canvas: HTMLCanvasElement; width: number; height: number; url: string; release: ReturnType<typeof vi.fn>; land: () => void }[] = [];
  const playback = MorphPlayback.for(h.overlay);
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(win.performance.now()), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    pictureCanvas: (canvas) => {
      const context: PictureCanvasContext = {
        globalAlpha: 1,
        imageSmoothingEnabled: true,
        setTransform: () => {},
        clearRect: () => {
          paints.push({ canvas, draws: [] });
          events.push(`paint ${canvas.width}x${canvas.height}`);
        },
        drawImage(image, _x, _y, w, h) {
          paints.at(-1)?.draws.push(`${(image as unknown as { src: string }).src} @${w}x${h}`);
        },
      };
      return context;
    },
    loadPicture: options.load ?? (async (src) => (src.endsWith(".svg") ? vector(src) : bitmap(src))),
    rasterizeSvgLayer: (source, _natural, w, h) => {
      const src = (source as unknown as { src?: string }).src ?? "svg";
      rasterized.push(`${src} ${w}x${h}`);
      if (options.refuse?.(src)) return Promise.resolve(undefined);
      return Promise.resolve(raster(src, w, h));
    },
    encodeOutline: (canvas) => {
      const url = `blob:outline-${outlines.length + 1}`;
      const release = vi.fn();
      events.push(`outline ${canvas.width}x${canvas.height}`);
      return new Promise((resolve) => {
        const land = () => resolve({ url, release });
        outlines.push({ canvas, width: canvas.width, height: canvas.height, url, release, land });
        if (!options.holdOutlines) land();
      });
    },
  });
  playback.placeholders = true;
  const reports = vi.fn();
  playback.reportStill = reports;
  const ui = h.ui as unknown as { applyBeat: (...args: unknown[]) => void };
  const apply = ui.applyBeat.bind(h.ui);
  ui.applyBeat = (...args: unknown[]) => {
    events.push("applied");
    apply(...args);
  };
  let id = 0;
  const beat = (writes: WriteImageParams[], line = 20) => {
    h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "ui/beat",
      params: {
        messages: writes.map((params) => ({ jsonrpc: "2.0", id: `write-${++id}`, method: "ui/write-image", params })),
        source: { uri: "file:///main.sd", range: { start: { line, character: 0 }, end: { line, character: 1 } } },
      },
    } as never);
  };
  const shadows = () =>
    Array.from({ length: SHADOWS }, (_, i) =>
      (Array.from(h.overlay.querySelectorAll(`.portrait > .shadow_${i + 1} > .instance`)) as HTMLElement[]).at(-1),
    );
  const masks = () => shadows().map((span) => span?.style.getPropertyValue("mask-image") ?? "");
  const outlinePaints = () => paints.filter((paint) => outlines.some((outline) => outline.canvas === paint.canvas));
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return { h, events, paints, rasterized, outlines, reports, beat, shadows, masks, outlinePaints, playback };
}

describe("a picture's shadows reuse the picture's rest-pose drawing (#2811)", () => {
  test("six mask elements show one outline, produced once from the picture's raster before the beat is applied, and none names an SVG", async () => {
    const t = await setup();
    t.beat([show("nova", ["/src/nova.svg"])]);
    await until(() => t.events.includes("applied"), "the beat");
    const size = `${BOX.width * DPR}x${BOX.height * DPR}`;
    expect(t.rasterized).toEqual([`/src/nova.svg ${size}`]);
    expect(t.events).toEqual([`paint ${size}`, `paint ${size}`, `outline ${size}`, "applied"]);
    expect(t.outlines).toHaveLength(1);
    expect(t.outlinePaints()).toEqual([{ canvas: t.outlines[0]!.canvas, draws: [`raster /src/nova.svg ${size} @${BOX.width * DPR}x${BOX.height * DPR}`] }]);
    expect(t.shadows().every((span) => span?.isConnected)).toBe(true);
    expect(t.masks()).toEqual(Array(SHADOWS).fill('url("blob:outline-1")'));
    expect(t.masks().some((mask) => mask.includes(".svg"))).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(t.outlines).toHaveLength(1);
    expect(t.events.at(-1)).toBe("applied");
  });

  test("a picture made of image files on its canvas gives its shadows an outline of its composited files, and one on the CSS drawing keeps CSS mask-image", async () => {
    const t = await setup();
    t.beat([show("hall", ["/src/sky.png", "/src/towers.png"], { vector: false })]);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.rasterized).toEqual([]);
    expect(t.outlines.map((outline) => `${outline.width}x${outline.height}`)).toEqual(["160x120"]);
    expect(t.outlinePaints()[0]!.draws).toEqual(["/src/sky.png @160x120", "/src/towers.png @160x120"]);
    expect(t.masks()).toEqual(Array(SHADOWS).fill('none, url("blob:outline-1")'));

    const kept = await (async () => {
      cleanup?.();
      const again = await setup({ load: async (src) => ({ ...bitmap(src), animated: true }) });
      again.beat([show("hall", ["/src/sky.png", "/src/towers.png"], { vector: false })]);
      await until(() => again.events.includes("applied"), "the beat on the CSS drawing");
      return again;
    })();
    expect(kept.outlines).toEqual([]);
    expect(kept.masks()).toEqual(Array(SHADOWS).fill(css(["/src/sky.png", "/src/towers.png"])));
  });

  test("a picture whose rest pose cannot be drawn gives its shadows nothing to show, with the placeholder and one warning on the picture", async () => {
    const t = await setup({ refuse: () => true });
    t.beat([show("nova", ["/src/nova.svg"])]);
    await until(() => t.events.includes("applied"), "the beat");
    await flushMicrotasks(10);
    expect(t.outlines).toEqual([]);
    expect(t.masks()).toEqual(Array(SHADOWS).fill(HIDDEN));
    expect(t.reports).toHaveBeenCalledTimes(1);
    expect(t.reports).toHaveBeenCalledWith({ image: "nova", file: "nova.svg", reason: "undrawn", placeholder: true });
  });

  test("the beat waits for the outline, and a beat that changes the picture's look replaces the outline before it is applied", async () => {
    const t = await setup({ holdOutlines: true });
    t.beat([show("nova", ["/src/nova.svg"])], 30);
    await until(() => t.outlines.length === 1, "the first outline");
    await flushMicrotasks(10);
    expect(t.events).not.toContain("applied");
    t.outlines[0]!.land();
    await until(() => t.events.includes("applied"), "the first beat");
    expect(t.masks()).toEqual(Array(SHADOWS).fill('url("blob:outline-1")'));

    t.beat([show("nova smiling", ["/src/nova-smile.svg"])], 32);
    await until(() => t.outlines.length === 2, "the second outline");
    await flushMicrotasks(10);
    expect(t.events.filter((event) => event === "applied")).toHaveLength(1);
    t.outlines[1]!.land();
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the second beat");
    expect(t.events.lastIndexOf(`outline ${BOX.width * DPR}x${BOX.height * DPR}`)).toBeLessThan(t.events.lastIndexOf("applied"));
    expect(t.masks()).toEqual(Array(SHADOWS).fill('url("blob:outline-2")'));
    expect(t.outlines[0]!.release).not.toHaveBeenCalled();
  });

  test("an outline still being made when the beat times out leaves the shadows empty until it lands", async () => {
    const t = await setup({ holdOutlines: true });
    t.h.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "assets/configure",
      params: { predictBytes: 0, loadBytes: 0, trimLayers: true, beatTimeout: 0.05, restoreTimeout: 0.05 },
    } as never);
    t.beat([show("nova", ["/src/nova.svg"])], 40);
    await until(() => t.events.includes("applied"), "the beat after its timeout");
    expect(t.masks()).toEqual(Array(SHADOWS).fill(HIDDEN));
    t.outlines[0]!.land();
    await until(() => t.masks().every((mask) => mask === 'url("blob:outline-1")'), "the outline to land");
  });
});

const KIT = ["base", "closed", "open"];

const KIT_CONTEXT = {
  image: {
    ...Object.fromEntries(KIT.map((name) => [name, { $type: "image", $name: name, src: `/src/${name}.png`, uri: `file:///${name}.png` }])),
    base: { $type: "image", $name: "base", src: "/src/base.svg", uri: "file:///base.svg" },
  },
  layered_image: {
    kit: {
      $type: "layered_image",
      $name: "kit",
      assets: { base: { $name: "base" }, "mouth.closed default": { $name: "closed" }, "mouth.open": { $name: "open" } },
    },
  },
};

const talkRecipe = () =>
  serializeMorphRecipe(
    buildMorphRecipe("talk", { blend: "cut", keyframes: [{ offset: 0, mouth: { state: "closed" } }, { offset: 0.5, mouth: { state: "open" } }, { offset: 1, mouth: { state: "closed" } }] } as never),
  );

const talkingKit = (files: { src: string; name: string }[], vectorPicture: boolean): WriteImageParams =>
  show(
    "kit",
    files.slice(0, 2).map((file) => file.src),
    {
      pictures: [{ layer: 0, span: 2, name: "kit", ...(vectorPicture ? { vector: true as const } : {}), files: files.slice(0, 2) }],
      morph: {
        plays: [
          {
            layer: 0,
            picture: { span: 2, files },
            ref: { morphs: ["talk"], key: `kit-talk-${vectorPicture ? "svg" : "png"}`, image: "kit", selection: "{}", groups: ["mouth"] },
            morph: "talk",
            owner: "nova",
            timing: { trigger: "speech", duration: 0.4, delay: 0, easing: "linear", iterations: 1, direction: "normal" } as never,
            definition: "d",
          },
        ],
        epoch: 0,
      },
    },
  );

describe("a drawn portrait's shadows keep its resting outline while a morph plays (#2811)", () => {
  test("a portrait made only of image files with a speech morph gives its shadows one outline of its resting files", async () => {
    const t = await setup();
    const context = {
      ...KIT_CONTEXT,
      image: Object.fromEntries(KIT.map((name) => [name, { $type: "image", $name: name, src: `/src/${name}.png`, uri: `file:///${name}.png` }])),
    };
    t.playback.configure({
      host: createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { talk: talkRecipe() }, variants: {} }),
        readSource: layeredMorphSource(() => context as never),
      }),
    });
    const files = KIT.map((name) => ({ src: `/src/${name}.png`, name: `${name}.png` }));
    t.beat([talkingKit(files, false)]);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.outlines).toHaveLength(1);
    expect(t.events.indexOf("outline 160x120")).toBeLessThan(t.events.indexOf("applied"));
    expect(t.outlinePaints()[0]!.draws).toEqual(["/src/base.png @160x120", "/src/closed.png @160x120"]);
    expect(t.masks()).toEqual(Array(SHADOWS).fill('none, url("blob:outline-1")'));
    t.playback.speak("nova", [[0, 2]]);
    for (let i = 0; i < 10; i++) {
      t.playback.advance(0.05);
      await flushMicrotasks(2);
    }
    expect(t.outlines).toHaveLength(1);
    expect(t.masks()).toEqual(Array(SHADOWS).fill('none, url("blob:outline-1")'));
  });

  test("the outline is made once from the rest pose and is unchanged while a speech morph plays", async () => {
    const t = await setup();
    t.playback.configure({
      host: createMorphHost({
        service: new MorphBakeService(),
        channel: () => ({ recipes: { talk: talkRecipe() }, variants: {} }),
        readSource: layeredMorphSource(() => KIT_CONTEXT as never),
      }),
    });
    const files = KIT.map((name) => (name === "base" ? { src: "/src/base.svg", name: "base.svg" } : { src: `/src/${name}.png`, name: `${name}.png` }));
    t.beat([talkingKit(files, true)]);
    await until(() => t.events.includes("applied"), "the beat");
    await until(() => t.masks().every((mask) => mask === 'none, url("blob:outline-1")'), "the outline on every shadow");
    expect(t.outlines).toHaveLength(1);
    const rest = t.outlinePaints()[0]!.draws;
    expect(rest).toHaveLength(2);
    expect(rest[0]).toMatch(/^raster \/src\/base\.svg /);
    expect(rest[1]).toMatch(/^\/src\/closed\.png /);
    const before = t.paints.length;
    t.playback.speak("nova", [[0, 2]]);
    for (let i = 0; i < 10; i++) {
      t.playback.advance(0.05);
      await flushMicrotasks(2);
    }
    expect(t.paints.length).toBeGreaterThan(before);
    expect(t.outlines).toHaveLength(1);
    expect(t.masks()).toEqual(Array(SHADOWS).fill('none, url("blob:outline-1")'));
  });
});
