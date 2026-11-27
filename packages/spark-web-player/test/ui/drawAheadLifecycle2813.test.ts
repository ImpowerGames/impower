import { afterEach, describe, expect, test, vi } from "vitest";
import { createMorphHost } from "@impower/sparkdown/src/morph/hosts";
import { serializeMorphRecipe } from "@impower/sparkdown/src/morph/recipe";
import { MorphBakeService } from "@impower/sparkdown/src/morph/service";
import { talk, talkingPortrait } from "@impower/sparkdown/test/morph/fixtures";
import UIManager from "../../src/app/managers/UIManager";
import { MorphPlayback, type MorphLayer } from "../../src/app/morph/MorphPlayback";
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

const picture = (name: string) => ({
  background: `url("/${name}.svg")`,
  imageNames: name,
  srcs: [`/${name}.svg`],
  pictures: [{ layer: 0, span: 1, name, vector: true as const, files: [{ src: `/${name}.svg`, name: `${name}.svg` }] }],
});

async function setup(options: { hold?: boolean; art?: string; host?: boolean; shadow?: boolean } = {}) {
  const { overlay, win, restore } = installJSDOM();
  overlay.innerHTML = `<div class="backdrop">${options.shadow ? '<div class="mask"></div>' : ""}<div class="image"></div></div>`;
  (overlay.firstElementChild as HTMLElement & { __sdId?: string }).__sdId = "backdrop";
  const app = createStubApp(overlay, () => {});
  (app as unknown as { answer: () => void }).answer = () => {};
  const ui = new UIManager(app);
  await ui.onInit();
  const style = win.document.createElement("style");
  style.textContent = ".instance { width: 100px; height: 100px; background-size: 100% 100%; background-position: 0% 0%; background-repeat: no-repeat; }";
  win.document.head.appendChild(style);
  const playback = MorphPlayback.for(overlay);
  const source = { text: options.art ?? '<svg viewBox="0 0 100 100"/>', viewBox: true };
  const requests: { text: string; resolve: (value: unknown) => void; release: ReturnType<typeof vi.fn> }[] = [];
  const outlines: { width: number; height: number; release: ReturnType<typeof vi.fn> }[] = [];
  playback.configure({
    requestFrame: (callback) => win.setTimeout(() => callback(0), 16) as unknown as number,
    cancelFrame: (handle) => win.clearTimeout(handle),
    loadPicture: async () => ({ image: {} as never, width: 100, height: 100, vector: source }),
    pictureCanvas: () => ({ globalAlpha: 1, imageSmoothingEnabled: true, setTransform() {}, clearRect() {}, drawImage() {} }),
    rasterizeSvgLayer: (raster) =>
      new Promise((resolve) => {
        const release = vi.fn();
        requests.push({ text: raster.text, resolve: resolve as (value: unknown) => void, release });
        if (!options.hold) resolve({ image: {} as never, release });
      }),
    encodeOutline: async (canvas) => {
      const release = vi.fn();
      outlines.push({ width: canvas.width, height: canvas.height, release });
      return { url: `blob:outline-${outlines.length}`, release };
    },
    ...(options.host
      ? {
          host: createMorphHost({
            service: new MorphBakeService(),
            channel: () => ({ recipes: { talk: serializeMorphRecipe(talk({ clips: [] })) }, variants: {} }) as never,
            readSource: async () => ({ text: options.art ?? "" }),
          }),
        }
      : {}),
  });
  playback.frameBudget = () => 1_000_000;
  const draw = (pictures: unknown[]) => ui.onReceiveNotification({ jsonrpc: "2.0", method: "assets/draw", params: { pictures } } as never);
  const ahead = (name: string, distance = 1, content: unknown = picture(name)) => ({ target: "backdrop", distance, zoom: 1, scale: 1, content });
  const instances = () => Array.from(overlay.querySelectorAll(".instance"));
  const layers = () => [...(playback as unknown as { layers: Set<MorphLayer> }).layers];
  cleanups.push(restore, () => {
    ui.onDispose();
    win.close();
  });
  return { ui, playback, overlay, win, requests, outlines, draw, ahead, instances, layers };
}

describe("drawing ahead keeps to its budget, its layout and its owner (#2813)", () => {
  test("a layout update while a picture is drawn ahead puts it away and draws it again under the new layout", async () => {
    const t = await setup({ hold: true });
    t.draw([t.ahead("a")]);
    await until(() => t.requests.length === 1, "the drawing ahead");
    const [first] = t.instances();
    expect(first).toBeDefined();
    await t.ui.onReceiveRequest({ jsonrpc: "2.0", id: "update", method: "ui/update", params: { element: "backdrop", style: { width: "200px" } } } as never);
    expect(first!.isConnected).toBe(false);
    await until(() => t.instances().length === 1 && t.instances()[0] !== first, "the picture mounted again");
    t.requests[0]!.resolve({ image: {} as never, release: t.requests[0]!.release });
    await until(() => t.instances().length === 0, "the drawing to finish");
    expect(t.playback.drawnAheadBytes()).toBe(100 * 100 * 4);
  });

  test("disposing the player releases the drawings kept only for drawing ahead", async () => {
    const t = await setup();
    t.draw([t.ahead("a")]);
    await until(() => t.requests.length === 1 && t.instances().length === 0, "the drawing ahead");
    expect(t.playback.drawnAheadBytes()).toBe(100 * 100 * 4);
    t.ui.onDispose();
    expect(t.playback.drawnAheadBytes()).toBe(0);
    expect(t.requests[0]!.release).toHaveBeenCalledOnce();
  });

  test("drawings kept ahead are dropped when the room prediction leaves them shrinks", async () => {
    const t = await setup();
    t.draw([t.ahead("a")]);
    await until(() => t.requests.length === 1 && t.instances().length === 0, "the drawing ahead");
    t.playback.frameBudget = () => 0;
    t.draw([t.ahead("a")]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.playback.drawnAheadBytes()).toBe(0);
    expect(t.requests[0]!.release).toHaveBeenCalledOnce();
  });

  test("a picture refused for lack of room is drawn ahead once there is room", async () => {
    const t = await setup();
    t.playback.frameBudget = () => 0;
    t.draw([t.ahead("a")]);
    await until(() => (t.ui as unknown as { _drawAhead: { drawn: Map<string, unknown> } })._drawAhead.drawn.size === 1, "the refused picture");
    expect(t.requests).toHaveLength(0);
    t.playback.frameBudget = () => 1_000_000;
    t.draw([t.ahead("a")]);
    await until(() => t.requests.length === 1, "the picture drawn once there is room");
  });

  test("a shadow outline drawn ahead counts against the same room as the drawings, and goes when the player is disposed", async () => {
    const t = await setup({ shadow: true });
    t.playback.frameBudget = () => 100 * 100 * 4 * 2;
    t.draw([t.ahead("a")]);
    await until(() => t.outlines.length === 1 && t.instances().length === 0, "the picture and its outline drawn ahead");
    expect(t.playback.drawnAheadBytes()).toBe(100 * 100 * 4 * 2);
    t.playback.frameBudget = () => 100 * 100 * 4;
    t.draw([t.ahead("a")]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.playback.drawnAheadBytes()).toBeLessThanOrEqual(100 * 100 * 4);
    t.playback.frameBudget = () => 1_000_000;
    const before = t.outlines.length;
    t.draw([t.ahead("b")]);
    await until(() => t.outlines.length === before + 1 && t.instances().length === 0, "a second picture drawn ahead");
    const kept = t.outlines.at(-1)!;
    expect(kept.release).not.toHaveBeenCalled();
    t.ui.onDispose();
    expect(kept.release).toHaveBeenCalledOnce();
    expect(t.playback.drawnAheadBytes()).toBe(0);
  });

  test("a shadow outline that does not fit is not made, keeps the drawing that fits, and is not tried again until there is room", async () => {
    const t = await setup({ shadow: true });
    t.playback.frameBudget = () => 100 * 100 * 4;
    t.draw([t.ahead("a")]);
    await until(() => t.requests.length === 1 && t.instances().length === 0, "the drawing that fits");
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(t.outlines).toHaveLength(0);
    expect(t.playback.drawnAheadBytes()).toBe(100 * 100 * 4);
    let mounted = 0;
    const observer = new t.win.MutationObserver((records) => {
      for (const record of records) mounted += Array.from(record.addedNodes).filter((node) => (node as HTMLElement).classList?.contains("instance")).length;
    });
    observer.observe(t.overlay, { childList: true, subtree: true });
    t.draw([t.ahead("a")]);
    await new Promise((resolve) => setTimeout(resolve, 100));
    observer.disconnect();
    expect(mounted).toBe(0);
    expect(t.requests).toHaveLength(1);
    expect(t.outlines).toHaveLength(0);
    expect(t.requests[0]!.release).not.toHaveBeenCalled();
    t.playback.frameBudget = () => 100 * 100 * 4 * 2;
    t.draw([t.ahead("a")]);
    await until(() => t.outlines.length === 1 && t.instances().length === 0, "the outline once there is room");
    expect(t.requests).toHaveLength(1);
    expect(t.playback.drawnAheadBytes()).toBe(100 * 100 * 4 * 2);
  });

  test("a portrait's morph frames drawn ahead are the frames its beat plans and shows, with nothing drawn again", async () => {
    const art = talkingPortrait();
    const t = await setup({ art, host: true });
    t.playback.frameBudget = () => 40_000 * 12;
    const content = {
      ...picture("nova"),
      morph: {
        epoch: 0,
        plays: [
          {
            layer: 0,
            ref: { morphs: ["talk"], key: "nova-talk", image: "nova", selection: "{}", groups: ["mouth"] },
            morph: "talk",
            owner: "nova",
            timing: { trigger: "speech", duration: 0.4, delay: 0, easing: "linear", iterations: 1, direction: "normal" },
            definition: "d",
          },
        ],
      },
    };
    const grids = (layer: MorphLayer) => (layer as unknown as { images: { poses?: { sets: { grids: unknown }[] } }[] }).images[0]?.poses?.sets[0]?.grids;
    let ahead: unknown;
    const mount = t.playback.mount.bind(t.playback);
    t.playback.mount = (...args: Parameters<MorphPlayback["mount"]>) => {
      const layer = mount(...args);
      if (layer.forecast !== undefined) {
        const dispose = layer.dispose.bind(layer);
        layer.dispose = () => {
          ahead = grids(layer);
          dispose();
        };
      }
      return layer;
    };
    t.draw([t.ahead("nova", 1, content)]);
    await until(() => ahead !== undefined, "the frames drawn ahead");
    const drawnAhead = t.requests.length;
    t.ui.onReceiveNotification({
      jsonrpc: "2.0",
      method: "ui/beat",
      params: { messages: [{ jsonrpc: "2.0", id: "show", method: "ui/write-image", params: { target: "backdrop", instructions: [{ control: "show", content }], instant: true } }] },
    } as never);
    await until(() => t.layers().some((layer) => layer.forecast === undefined && layer.drawn), "the beat's portrait");
    const shown = t.layers().find((layer) => layer.forecast === undefined)!;
    expect(grids(shown)).toEqual(ahead);
    expect(t.requests).toHaveLength(drawnAhead);
  });
});
