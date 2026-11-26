import NOVA from "../../../../../.agents/skills/drive-vscode-web/fixtures/pacing/project/assets/nova.svg";
import { browserOutlineEncoder, workerOutlineEncode } from "../../../src/app/morph/MorphPlayback";
import { browserSvgLayerRasterizer, readSvgLayer } from "../../../src/app/morph/svgLayerFile";

const NATURAL = { width: 1600, height: 1200 };

const box = (id: string, width: number, height: number, mask: string) => {
  const element = document.getElementById(id) ?? document.body.appendChild(Object.assign(document.createElement("div"), { id }));
  element.setAttribute(
    "style",
    `width:${width}px;height:${height}px;display:inline-block;background:#1b2a6b;mask-image:${mask};-webkit-mask-image:${mask};mask-size:100% 100%;-webkit-mask-size:100% 100%;mask-repeat:no-repeat;-webkit-mask-repeat:no-repeat`,
  );
  return element;
};

async function show(width: number, height: number) {
  const dpr = window.devicePixelRatio || 1;
  const w = Math.round(width * dpr);
  const h = Math.round(height * dpr);
  const verdict = readSvgLayer(NOVA, new DOMParser(), { view: window });
  if (!("source" in verdict)) throw new Error("the fixture portrait is refused");
  const raster = await browserSvgLayerRasterizer(verdict.source, NATURAL, w, h, document);
  if (!raster) throw new Error("the rasterizer refused the portrait");
  const outline = () => {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(raster.image, 0, 0, w, h);
    return canvas;
  };
  const proto = HTMLCanvasElement.prototype as unknown as { toBlob: (...args: unknown[]) => void };
  const original = proto.toBlob;
  let pageEncodes = 0;
  proto.toBlob = function (this: HTMLCanvasElement, ...args: unknown[]) {
    pageEncodes += 1;
    return original.apply(this, args);
  };
  let worker: { url: string; release(): void } | undefined;
  try {
    worker = await browserOutlineEncoder(outline());
  } finally {
    proto.toBlob = original;
  }
  const paged = await new Promise<Blob | null>((resolve) => outline().toBlob(resolve, "image/png"));
  raster.release();
  if (!worker || !paged) throw new Error("an outline could not be encoded");
  const pageUrl = URL.createObjectURL(paged);
  const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(NOVA)}`;
  box("worker", width, height, `url("${worker.url}")`);
  box("page", width, height, `url("${pageUrl}")`);
  box("css", width, height, `url("${svgUrl}")`);
  await Promise.all(
    [worker.url, pageUrl, svgUrl].map((src) => {
      const img = new Image();
      img.src = src;
      return img.decode().catch(() => undefined);
    }),
  );
  await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const capable = typeof (window as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas === "function" && typeof window.createImageBitmap === "function";
  return { capable, offThread: !!workerOutlineEncode(window), pageEncodes };
}

(window as unknown as { outlines: unknown }).outlines = { show };
