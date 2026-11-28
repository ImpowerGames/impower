import UIManager from "../../../src/app/managers/UIManager";
import { MorphPlayback, type PictureBitmap, type PictureCanvasContext } from "../../../src/app/morph/MorphPlayback";
import type { SvgLayerRaster } from "../../../src/app/morph/svgLayerFile";

let id = 0;

const request = (method: string, params: unknown) => ({ jsonrpc: "2.0", id: `probe-${++id}`, method, params }) as never;

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 80"/>';

const STAGE = `<style>
body { margin: 0; }
#game { position: relative; width: 640px; height: 360px; container-type: size; container-name: screen; }
spark-web-player #game-ui { position: absolute; inset: 0; }
.card { position: absolute; left: 10.5px; top: 7.25px; width: 100px; background-color: red; }
.card .image .instance { display: block; width: 100%; height: 50px; background-size: 100% 100%; background-repeat: no-repeat; }
</style><spark-web-player><div id="game"><div id="game-ui"></div></div></spark-web-player>`;

async function stage(holdLoad: boolean) {
  document.body.innerHTML = STAGE;
  const overlay = document.getElementById("game-ui") as HTMLElement & { __sdBeat?: unknown };
  const rasters: { width: number; height: number; resolve: (raster: SvgLayerRaster | undefined) => void }[] = [];
  const context: PictureCanvasContext = { globalAlpha: 1, imageSmoothingEnabled: true, setTransform: () => {}, clearRect: () => {}, drawImage: () => {} };
  MorphPlayback.for(overlay).configure({
    loadPicture: holdLoad
      ? () => new Promise<PictureBitmap | undefined>(() => {})
      : async (src) => ({ image: { src } as never, width: 160, height: 80, vector: { text: SVG, viewBox: true, src } as never }),
    rasterizeSvgLayer: (_source, _natural, width, height) => new Promise((resolve) => rasters.push({ width, height, resolve })),
    pictureCanvas: () => context,
  });
  const ui = new UIManager({ overlay, answer() {}, emit() {}, audioClock: { reading: { outputLatency: 0 }, toDocumentTime: (time: number) => time } } as never);
  let applied = 0;
  const target = ui as unknown as { applyBeat: (...args: unknown[]) => void };
  const apply = target.applyBeat.bind(ui);
  target.applyBeat = (...args: unknown[]) => {
    applied += 1;
    apply(...args);
  };
  await ui.onReceiveRequest(request("ui/create", { parent: null, element: "card", type: "div", name: "card", breakpoints: {} }));
  await ui.onReceiveRequest(request("ui/create", { parent: "card", element: "card-image", type: "div", name: "image", breakpoints: {} }));
  const show = request("ui/write-image", {
    target: "card",
    instructions: [
      {
        control: "show",
        content: {
          background: 'url("/picture.svg")',
          imageNames: "picture",
          srcs: ["/picture.svg"],
          pictures: [{ name: "picture", layer: 0, span: 1, vector: true, files: [{ src: "/picture.svg", name: "picture.svg" }] }],
        },
      },
    ],
  });
  const beat = (messages: unknown[]) => ui.onReceiveNotification({ jsonrpc: "2.0", method: "ui/beat", params: { messages } } as never);
  const sheet = (styles: Record<string, Record<string, string>>) =>
    ui.onReceiveRequest(request("ui/create", { parent: null, element: "sheet", type: "style", name: "sheet", content: { styles }, breakpoints: {} }));
  const settle = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  return {
    ui,
    card: ui.getElement("card") as HTMLElement,
    rasters,
    show,
    beat,
    sheet,
    settle,
    applied: () => applied,
    waiting: () => Boolean(overlay.__sdBeat),
    look: () => {
      const card = ui.getElement("card") as HTMLElement;
      return { width: card.offsetWidth, color: getComputedStyle(card).backgroundColor };
    },
  };
}

async function sheetChangeWhileWaiting() {
  const t = await stage(true);
  await t.sheet({ card: { width: "100px", background_color: "rgb(0, 0, 255)" } });
  const before = t.look();
  t.beat([request("ui/update", { element: "sheet", content: { styles: { card: { width: "300px", background_color: "rgb(0, 128, 0)" } } }, breakpoints: {} }), t.show]);
  await t.settle(50);
  const during = t.look();
  const result = { before, during, applied: t.applied(), waiting: t.waiting() };
  t.ui.onDispose();
  return result;
}

async function sheetRemoved() {
  const t = await stage(false);
  await t.sheet({ card: { width: "300px" } });
  t.beat([t.show]);
  for (let i = 0; i < 100 && t.rasters.length < 1; i++) await t.settle(10);
  const first = t.rasters[0];
  first?.resolve({ image: document.createElement("canvas"), release: () => {} });
  for (let i = 0; i < 100 && t.applied() < 1; i++) await t.settle(10);
  await t.settle(50);
  t.beat([request("ui/destroy", { element: "sheet" })]);
  await t.settle(50);
  const asked = t.rasters.slice(1).map(({ width, height }) => [width, height]);
  const waiting = t.waiting();
  const appliedBefore = t.applied();
  const second = t.rasters[1];
  second?.resolve({ image: document.createElement("canvas"), release: () => {} });
  for (let i = 0; i < 100 && t.applied() < 2; i++) await t.settle(10);
  const result = { first: first && [first.width, first.height], asked, waiting, appliedBefore, appliedAfter: t.applied(), width: t.look().width };
  t.ui.onDispose();
  return result;
}

(window as unknown as { measuredBeatProbe: unknown }).measuredBeatProbe = { sheetChangeWhileWaiting, sheetRemoved };
