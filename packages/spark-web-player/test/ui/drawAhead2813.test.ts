import { afterEach, describe, expect, test, vi } from "vitest";
import type { DrawAheadPicture } from "@impower/spark-engine/src/game/modules/assets/classes/messages/DrawAheadMessage";
import type { LayeredPicture, WriteImageParams } from "@impower/spark-engine/src/game/modules/ui/classes/messages/WriteImageMessage";
import { pictureViewOf } from "../../../spark-dom/src/utils/placePicture";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../src/app/morph/MorphPlayback";
import type { SvgLayerRaster } from "../../src/app/morph/svgLayerFile";
import { createDOMHarness, flushMicrotasks, untilShown } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const SOURCE = `layout main {
  stage {
    backdrop {
      image
    }
    sigil {
      image
    }
    badge {
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

const BOX = { width: 400, height: 225 };
const STYLE_SCALE = 1.5;
const DPR = 2;

const SVG = { text: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 90"/>', viewBox: true };

const vector = (src: string): PictureBitmap => ({ image: { src } as never, width: 160, height: 90, vector: { ...SVG, src } as never });

const picture = (name: string, srcs: string[]): LayeredPicture => ({
  layer: 0,
  span: srcs.length,
  name,
  vector: true,
  files: srcs.map((src) => ({ src, name: src.slice(src.lastIndexOf("/") + 1) })),
});

const content = (name: string, src: string) => ({
  background: `url("${src}")`,
  imageNames: name,
  srcs: [src],
  pictures: [picture(name, [src])],
});

const show = (target: string, name: string, src: string): WriteImageParams => ({
  target,
  instant: false,
  instructions: [{ control: "show", content: content(name, src) }],
});

const zoomTo = (target: string, zoom: number): WriteImageParams => ({
  target,
  instant: false,
  instructions: [{ control: "animate", travel: { framing: { x: 0.5, y: 0.5, zoom }, timing: { delay: "0s", duration: "1s", easing: "linear" } } }],
});

const ahead = (target: string, name: string, src: string, distance: number, zoom = 1, scale = 1): DrawAheadPicture => ({
  target,
  distance,
  zoom,
  scale,
  content: content(name, src),
});

const size = (reach = 1) => ({
  width: Math.round(BOX.width * DPR * STYLE_SCALE * reach),
  height: Math.round(BOX.height * DPR * STYLE_SCALE * reach),
});

interface Asked {
  src: string;
  width: number;
  height: number;
  resolve: (raster: SvgLayerRaster | undefined) => void;
}

interface FakeAnimation {
  playState: string;
  effect: { getComputedTiming: () => { endTime: number } };
  finished: Promise<unknown>;
  end: () => void;
}

const animation = (endTime: number): FakeAnimation => {
  let end = () => {};
  const fake: FakeAnimation = {
    playState: "running",
    effect: { getComputedTiming: () => ({ endTime }) },
    finished: new Promise((resolve) => (end = () => resolve(undefined))),
    end: () => {
      fake.playState = "finished";
      end();
    },
  };
  return fake;
};

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

async function setup(options: { holdRasters?: boolean } = {}) {
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
  sheet.textContent = `.instance { width: ${BOX.width}px !important; height: ${BOX.height}px !important; background-size: 100% 100% !important; background-position: 0% 0% !important; background-repeat: no-repeat !important; }`;
  win.document.head.appendChild(sheet);
  const proto = win.HTMLElement.prototype as HTMLElement;
  const laidOut = (el: HTMLElement) => {
    for (let at: HTMLElement | null = el; at; at = at.parentElement) if (at.style.getPropertyValue("display") === "none") return false;
    return el.classList.contains("instance");
  };
  const width = Object.getOwnPropertyDescriptor(proto, "offsetWidth");
  const height = Object.getOwnPropertyDescriptor(proto, "offsetHeight");
  const rect = Object.getOwnPropertyDescriptor(proto, "getBoundingClientRect");
  Object.defineProperty(proto, "offsetWidth", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? BOX.width : 0; } });
  Object.defineProperty(proto, "offsetHeight", { configurable: true, get: function (this: HTMLElement) { return laidOut(this) ? BOX.height : 0; } });
  Object.defineProperty(proto, "getBoundingClientRect", {
    configurable: true,
    value(this: HTMLElement) {
      const zoom = laidOut(this) ? pictureViewOf(this).zoom : 0;
      const across = BOX.width * STYLE_SCALE * zoom;
      const down = BOX.height * STYLE_SCALE * zoom;
      return { x: 0, y: 0, left: 0, top: 0, right: across, bottom: down, width: across, height: down, toJSON() {} };
    },
  });
  const events: string[] = [];
  const asked: Asked[] = [];
  const released: string[] = [];
  const raster = (src: string, w: number, hgt: number): SvgLayerRaster => ({
    image: { src: `raster ${src} ${w}x${hgt}` } as never,
    release: () => released.push(`${src} ${w}x${hgt}`),
  });
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
          events.push(`paint ${canvas.width}x${canvas.height}`);
        },
        drawImage() {},
      };
      return context;
    },
    loadPicture: async (src) => vector(src),
    rasterizeSvgLayer: (source, _natural, w, hgt) => {
      const src = (source as unknown as { src?: string }).src ?? "svg";
      return new Promise((resolve) => {
        const entry: Asked = { src, width: w, height: hgt, resolve };
        asked.push(entry);
        if (!options.holdRasters) resolve(raster(src, w, hgt));
      });
    },
  });
  playback.placeholders = true;
  const reports = vi.fn();
  playback.reportStill = reports;
  let animations: FakeAnimation[] = [];
  (h.overlay as unknown as { getAnimations: () => FakeAnimation[] }).getAnimations = () => animations;
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
  const drawAhead = (pictures: DrawAheadPicture[]) => {
    h.ui.onReceiveNotification({ jsonrpc: "2.0", method: "assets/draw", params: { pictures } } as never);
  };
  const spans = (target: string) => Array.from(h.overlay.querySelectorAll(`.${target} > .image > .instance`)) as HTMLElement[];
  const idle = () => (h.overlay as HTMLElement & { __sdBeat?: unknown }).__sdBeat === undefined;
  cleanup = () => {
    h.ui.onDispose();
    if (width) Object.defineProperty(proto, "offsetWidth", width);
    else delete (proto as unknown as Record<string, unknown>)["offsetWidth"];
    if (height) Object.defineProperty(proto, "offsetHeight", height);
    else delete (proto as unknown as Record<string, unknown>)["offsetHeight"];
    if (rect) Object.defineProperty(proto, "getBoundingClientRect", rect);
  };
  return {
    h,
    win,
    events,
    asked,
    released,
    reports,
    raster,
    beat,
    drawAhead,
    spans,
    idle,
    playback,
    setAnimations: (list: FakeAnimation[]) => (animations = list),
  };
}

const settledAhead = (t: Awaited<ReturnType<typeof setup>>, targets: string[]) =>
  until(() => targets.every((target) => t.spans(target).length === 0), "the pictures drawn ahead to be put away");

describe("the next beat's pictures are drawn while the current beat is settled, sized from the beats ahead (#2813)", () => {
  test("a picture is drawn ahead once at the largest size the beats ahead reach, and neither its beat nor the zoom after it draws it again", async () => {
    const t = await setup();
    t.drawAhead([ahead("backdrop", "dusk", "/src/dusk.svg", 1, 1.5)]);
    await until(() => t.asked.length === 1, "the drawing ahead");
    const big = size(1.5);
    expect(t.asked.map(({ src, width, height }) => ({ src, width, height }))).toEqual([{ src: "/src/dusk.svg", ...big }]);
    await settledAhead(t, ["backdrop"]);
    expect(t.playback.drawnAheadBytes()).toBe(big.width * big.height * 4);
    t.events.length = 0;
    t.beat([show("backdrop", "dusk", "/src/dusk.svg")], 30);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.events).toEqual([`paint ${big.width}x${big.height}`, "applied"]);
    t.beat([zoomTo("backdrop", 1.5)], 32);
    await until(() => t.events.filter((event) => event === "applied").length === 2, "the zoom");
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(t.asked).toHaveLength(1);
    expect(t.events).toEqual([`paint ${big.width}x${big.height}`, "applied", "applied"]);
    expect(t.playback.drawnAheadBytes()).toBe(0);
    expect(t.reports).not.toHaveBeenCalled();
  });

  test("a picture already drawn ahead at the same size is kept, not drawn again, when the next line settles", async () => {
    const t = await setup();
    t.drawAhead([ahead("backdrop", "dusk", "/src/dusk.svg", 2, 1.5)]);
    await until(() => t.asked.length === 1, "the drawing ahead");
    await settledAhead(t, ["backdrop"]);
    const paints = t.events.length;
    const bytes = t.playback.drawnAheadBytes();
    let mounted = 0;
    const observer = new t.win.MutationObserver((records) => {
      mounted += records.reduce((count, record) => count + Array.from(record.addedNodes).filter((node) => (node as HTMLElement).classList?.contains("instance")).length, 0);
    });
    observer.observe(t.h.overlay, { childList: true, subtree: true });
    t.drawAhead([ahead("backdrop", "dusk", "/src/dusk.svg", 1, 1.5)]);
    await new Promise((resolve) => setTimeout(resolve, 200));
    observer.disconnect();
    expect(mounted).toBe(0);
    expect(t.asked).toHaveLength(1);
    expect(t.events).toHaveLength(paints);
    expect(t.playback.drawnAheadBytes()).toBe(bytes);
    t.beat([show("backdrop", "dusk", "/src/dusk.svg")], 30);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.asked).toHaveLength(1);
  });

  test("drawing ahead starts once the last letter is revealed and no move or transition runs, and a looping idle animation does not hold it back", async () => {
    const t = await setup();
    const letters = animation(2000);
    const move = animation(3000);
    const idle = animation(Infinity);
    t.setAnimations([letters, move, idle]);
    t.drawAhead([ahead("sigil", "emblem", "/src/emblem.svg", 1)]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.asked).toHaveLength(0);
    letters.end();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.asked).toHaveLength(0);
    move.end();
    await until(() => t.asked.length === 1, "the drawing ahead");
    expect(idle.playState).toBe("running");
  });

  test("drawing ahead starts at once after a click skips the typing", async () => {
    const t = await setup();
    const letters = animation(2000);
    t.setAnimations([letters]);
    t.drawAhead([ahead("sigil", "emblem", "/src/emblem.svg", 1)]);
    await flushMicrotasks(20);
    expect(t.asked).toHaveLength(0);
    t.h.overlay.ownerDocument.dispatchEvent(new t.win.Event("pointerdown"));
    letters.playState = "finished";
    t.drawAhead([ahead("sigil", "emblem", "/src/emblem.svg", 1)]);
    await until(() => t.asked.length === 1, "the drawing ahead");
  });

  test("drawing ahead stops when a click arrives, keeps what it finished, and the next beat uses it", async () => {
    const t = await setup({ holdRasters: true });
    t.drawAhead([ahead("sigil", "emblem", "/src/emblem.svg", 1), ahead("badge", "hall", "/src/hall.svg", 2)]);
    await until(() => t.asked.length === 1, "the first drawing ahead");
    expect(t.spans("sigil")).toHaveLength(1);
    t.h.overlay.ownerDocument.dispatchEvent(new t.win.Event("pointerdown"));
    expect(t.spans("sigil")).toHaveLength(0);
    const first = t.asked[0]!;
    first.resolve(t.raster(first.src, first.width, first.height));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(t.asked).toHaveLength(1);
    expect(t.spans("badge")).toHaveLength(0);
    t.events.length = 0;
    t.beat([show("sigil", "emblem", "/src/emblem.svg")], 40);
    await until(() => t.events.includes("applied"), "the beat");
    expect(t.asked).toHaveLength(1);
  });

  test("both branches of a choice have their pictures drawn while the choice is on screen, and either branch's beat fires from them", async () => {
    const t = await setup();
    t.beat([show("backdrop", "dusk", "/src/dusk.svg")], 50);
    await until(() => t.events.includes("applied"), "the choice");
    const before = t.asked.length;
    t.drawAhead([ahead("sigil", "emblem", "/src/emblem.svg", 1), ahead("badge", "hall", "/src/hall.svg", 3)]);
    await until(() => t.asked.length === before + 2, "both branches drawn ahead");
    expect(t.asked.slice(before).map((entry) => entry.src)).toEqual(["/src/emblem.svg", "/src/hall.svg"]);
    await settledAhead(t, ["sigil", "badge"]);
    t.events.length = 0;
    t.beat([show("badge", "hall", "/src/hall.svg")], 60);
    await until(() => t.events.includes("applied"), "the second branch's beat");
    expect(t.asked).toHaveLength(before + 2);
  });

  test("drawings count at their drawn size, the furthest ahead is dropped first when the pool is full, and a shown beat's drawing is kept", async () => {
    const t = await setup();
    const one = size();
    const bytes = one.width * one.height * 4;
    t.playback.frameBudget = () => bytes * 2;
    const drawn = (src: string) => `${src} ${one.width}x${one.height}`;
    t.drawAhead([
      ahead("backdrop", "dusk", "/src/dusk.svg", 1),
      ahead("sigil", "emblem", "/src/emblem.svg", 2),
      ahead("badge", "hall", "/src/hall.svg", 3),
    ]);
    await until(() => t.asked.length === 2, "the drawings that fit");
    await settledAhead(t, ["backdrop", "sigil", "badge"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.asked.map((entry) => entry.src)).toEqual(["/src/dusk.svg", "/src/emblem.svg"]);
    expect(t.playback.drawnAheadBytes()).toBe(bytes * 2);
    t.drawAhead([
      ahead("badge", "dawn", "/src/dawn.svg", 1),
      ahead("backdrop", "dusk", "/src/dusk.svg", 2),
      ahead("sigil", "emblem", "/src/emblem.svg", 3),
    ]);
    await until(() => t.asked.length === 3, "the nearer drawing");
    await settledAhead(t, ["backdrop", "sigil", "badge"]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.asked.map((entry) => entry.src)).toEqual(["/src/dusk.svg", "/src/emblem.svg", "/src/dawn.svg"]);
    expect(t.released).toEqual([drawn("/src/emblem.svg")]);
    expect(t.playback.drawnAheadBytes()).toBe(bytes * 2);
    t.beat([show("backdrop", "dusk", "/src/dusk.svg")], 70);
    await until(() => t.idle() && t.events.includes("applied"), "the beat showing the drawing");
    expect(t.asked).toHaveLength(3);
    t.drawAhead([ahead("sigil", "far", "/src/far.svg", 1), ahead("badge", "farther", "/src/farther.svg", 2)]);
    await until(() => t.asked.length === 5, "the next drawings");
    await settledAhead(t, ["sigil", "badge"]);
    expect(t.released).toEqual([drawn("/src/emblem.svg"), drawn("/src/dawn.svg")]);
    expect(t.released).not.toContain(drawn("/src/dusk.svg"));
    expect(t.playback.drawnAheadBytes()).toBe(bytes * 2);
  });
});
