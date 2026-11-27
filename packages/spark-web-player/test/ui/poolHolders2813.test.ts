import { afterEach, describe, expect, test, vi } from "vitest";
import UIManager from "../../src/app/managers/UIManager";
import { MorphPlayback } from "../../src/app/morph/MorphPlayback";
import { createStubApp, installJSDOM } from "./domTestHarness";

vi.setConfig({ testTimeout: 60_000 });

const cleanups: (() => void)[] = [];

afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
});

async function until(check: () => boolean, what: string) {
  for (let n = 0; n < 1000; n++) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

const BYTES = 100 * 100 * 4;

function pool() {
  const { overlay, win, restore } = installJSDOM();
  const playback = MorphPlayback.for(overlay);
  const rasters: { release: ReturnType<typeof vi.fn> }[] = [];
  const outlines: { release: ReturnType<typeof vi.fn> }[] = [];
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(0), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    pictureCanvas: () => ({ globalAlpha: 1, imageSmoothingEnabled: true, setTransform() {}, clearRect() {}, drawImage() {} }),
    rasterizeSvgLayer: async () => {
      const release = vi.fn();
      rasters.push({ release });
      return { image: {} as never, release };
    },
    encodeOutline: async () => {
      const release = vi.fn();
      outlines.push({ release });
      return { url: `blob:outline-${outlines.length}`, release };
    },
  });
  playback.frameBudget = () => 1_000_000;
  cleanups.push(restore, () => win.close());
  const source = { text: '<svg viewBox="0 0 100 100"/>', viewBox: true };
  const natural = { width: 100, height: 100 };
  const drawing = async (forecast?: number) => (await playback.raster(source, natural, 100, 100, win.document, forecast))!;
  const outlineSource = { state: "ready" as const, key: "shadow", width: 100, height: 100, natural, draw: () => {} };
  const outline = async (forecast?: number) => {
    const hold = playback.outline(outlineSource, forecast);
    await hold.outline.ready;
    return hold;
  };
  const squeeze = () => {
    playback.frameBudget = () => 0;
    playback.beginForecast();
  };
  return { playback, rasters, outlines, drawing, outline, squeeze };
}

describe("the drawing pool tracks each holder of a drawing or an outline through its own handle (#2813)", () => {
  test("a shown and an ahead holder of one drawing are counted apart, and the drawing counts against the room only while no shown layer holds it", async () => {
    const t = pool();
    const ahead = await t.drawing(1);
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    const shown = await t.drawing();
    expect(t.rasters).toHaveLength(1);
    expect(t.playback.drawnAheadBytes()).toBe(0);
    shown.release();
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    t.squeeze();
    expect(t.rasters[0]!.release).not.toHaveBeenCalled();
    ahead.release();
    expect(t.rasters[0]!.release).toHaveBeenCalledOnce();
    expect(t.playback.drawnAheadBytes()).toBe(0);
  });

  test("a shown and an ahead holder of one outline are counted apart, and the outline counts against the room only while no shown layer holds it", async () => {
    const t = pool();
    const ahead = await t.outline(1);
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    const shown = await t.outline();
    expect(t.outlines).toHaveLength(1);
    expect(t.playback.drawnAheadBytes()).toBe(0);
    shown.release();
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    t.squeeze();
    expect(t.outlines[0]!.release).not.toHaveBeenCalled();
    ahead.release();
    expect(t.outlines[0]!.release).toHaveBeenCalledOnce();
    expect(t.playback.drawnAheadBytes()).toBe(0);
  });

  test("releasing a drawing's handle twice changes nothing, so another holder keeps it", async () => {
    const t = pool();
    const first = await t.drawing(1);
    const second = await t.drawing(1);
    first.release();
    first.release();
    t.squeeze();
    expect(t.rasters[0]!.release).not.toHaveBeenCalled();
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    second.release();
    expect(t.rasters[0]!.release).toHaveBeenCalledOnce();
  });

  test("releasing an outline's handle twice changes nothing, so another holder keeps it", async () => {
    const t = pool();
    const first = await t.outline(1);
    const second = await t.outline(1);
    first.release();
    first.release();
    t.squeeze();
    expect(t.outlines[0]!.release).not.toHaveBeenCalled();
    expect(t.playback.drawnAheadBytes()).toBe(BYTES);
    second.release();
    expect(t.outlines[0]!.release).toHaveBeenCalledOnce();
  });

  test("a drawing or an outline a shown layer holds is neither dropped nor counted when the room is gone and the list ends", async () => {
    const t = pool();
    const drawing = await t.drawing();
    const outline = await t.outline();
    t.squeeze();
    t.playback.endForecast();
    t.playback.dropForecasts();
    expect(t.rasters[0]!.release).not.toHaveBeenCalled();
    expect(t.outlines[0]!.release).not.toHaveBeenCalled();
    expect(t.playback.drawnAheadBytes()).toBe(0);
    drawing.release();
    outline.release();
    expect(t.rasters[0]!.release).toHaveBeenCalledOnce();
  });

  test("disposing the player while a picture and its shadow are drawn ahead releases every drawing and outline once its layer lets them go", async () => {
    const { overlay, win, restore } = installJSDOM();
    overlay.innerHTML = '<div class="backdrop"><div class="mask"></div><div class="image"></div></div>';
    (overlay.firstElementChild as HTMLElement & { __sdId?: string }).__sdId = "backdrop";
    const app = createStubApp(overlay, () => {});
    (app as unknown as { answer: () => void }).answer = () => {};
    const ui = new UIManager(app);
    await ui.onInit();
    const style = win.document.createElement("style");
    style.textContent = ".instance { width: 100px; height: 100px; background-size: 100% 100%; background-position: 0% 0%; background-repeat: no-repeat; }";
    win.document.head.appendChild(style);
    const playback = MorphPlayback.for(overlay);
    const source = { text: '<svg viewBox="0 0 100 100"/>', viewBox: true };
    const rasters: { release: ReturnType<typeof vi.fn> }[] = [];
    const outlines: { resolve: () => void; release: ReturnType<typeof vi.fn> }[] = [];
    playback.configure({
      requestFrame: (callback) => win.setTimeout(() => callback(0), 16) as unknown as number,
      cancelFrame: (handle) => win.clearTimeout(handle),
      loadPicture: async () => ({ image: {} as never, width: 100, height: 100, vector: source }),
      pictureCanvas: () => ({ globalAlpha: 1, imageSmoothingEnabled: true, setTransform() {}, clearRect() {}, drawImage() {} }),
      rasterizeSvgLayer: async () => {
        const release = vi.fn();
        rasters.push({ release });
        return { image: {} as never, release };
      },
      encodeOutline: () =>
        new Promise((resolve) => {
          const release = vi.fn();
          const n = outlines.length + 1;
          outlines.push({ resolve: () => resolve({ url: `blob:outline-${n}`, release }), release });
        }),
    });
    playback.frameBudget = () => 1_000_000;
    cleanups.push(restore, () => win.close());
    const content = {
      background: 'url("/a.svg")',
      imageNames: "a",
      srcs: ["/a.svg"],
      pictures: [{ layer: 0, span: 1, name: "a", vector: true as const, files: [{ src: "/a.svg", name: "a.svg" }] }],
    };
    ui.onReceiveNotification({ jsonrpc: "2.0", method: "assets/draw", params: { pictures: [{ target: "backdrop", distance: 1, zoom: 1, scale: 1, content }] } } as never);
    await until(() => rasters.length === 1 && outlines.length === 1, "the picture drawn ahead and its outline being made");
    expect(overlay.querySelectorAll(".instance").length).toBeGreaterThan(0);
    ui.onDispose();
    for (const outline of outlines) outline.resolve();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(overlay.querySelectorAll(".instance")).toHaveLength(0);
    for (const raster of rasters) expect(raster.release).toHaveBeenCalledOnce();
    for (const outline of outlines) expect(outline.release).toHaveBeenCalledOnce();
    expect(playback.drawnAheadBytes()).toBe(0);
  });
});
