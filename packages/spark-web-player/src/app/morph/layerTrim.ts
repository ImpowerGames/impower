export interface PaintedBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrimmedLayer {
  image: CanvasImageSource & { close?: () => void };
  box: PaintedBox;
  width: number;
  height: number;
}

export type LayerTrimmer = (bytes: Uint8Array, type?: string) => Promise<TrimmedLayer | undefined>;

export const TRIM_MARGIN = 2;

export const TRIM_IDLE_MS = 1000;

export function paintedBox(alpha: ArrayLike<number>, width: number, height: number, margin: number): PaintedBox | undefined {
  let top = -1;
  for (let y = 0; y < height && top < 0; y++) {
    for (let x = 0, at = y * width * 4 + 3; x < width; x++, at += 4) {
      if (alpha[at] !== 0) {
        top = y;
        break;
      }
    }
  }
  if (top < 0) return undefined;
  let bottom = top;
  for (let y = height - 1; y > top; y--) {
    let painted = false;
    for (let x = 0, at = y * width * 4 + 3; x < width; x++, at += 4) {
      if (alpha[at] !== 0) {
        painted = true;
        break;
      }
    }
    if (painted) {
      bottom = y;
      break;
    }
  }
  let left = width;
  let right = -1;
  for (let y = top; y <= bottom; y++) {
    const row = y * width * 4 + 3;
    for (let x = 0; x < left; x++) {
      if (alpha[row + x * 4] !== 0) {
        left = x;
        break;
      }
    }
    for (let x = width - 1; x > right; x--) {
      if (alpha[row + x * 4] !== 0) {
        right = x;
        break;
      }
    }
  }
  const x0 = Math.max(0, left - margin);
  const y0 = Math.max(0, top - margin);
  const x1 = Math.min(width, right + 1 + margin);
  const y1 = Math.min(height, bottom + 1 + margin);
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function trimWorker(scope: any, findBox: typeof paintedBox, margin: number) {
  scope.onmessage = async (event: MessageEvent) => {
    const { id, bytes, type } = event.data as { id: number; bytes: ArrayBuffer; type?: string };
    try {
      const full: ImageBitmap = await scope.createImageBitmap(new Blob([bytes], type ? { type } : {}));
      const width = full.width;
      const height = full.height;
      const canvas = new scope.OffscreenCanvas(width, height);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(full, 0, 0);
      const pixels = context.getImageData(0, 0, width, height).data;
      canvas.width = 1;
      canvas.height = 1;
      const box = findBox(pixels, width, height, margin) ?? { x: 0, y: 0, width: 1, height: 1 };
      if (box.width >= width && box.height >= height) {
        full.close();
        scope.postMessage({ id, width, height });
        return;
      }
      const image: ImageBitmap = await scope.createImageBitmap(full, box.x, box.y, box.width, box.height);
      full.close();
      scope.postMessage({ id, width, height, box, image }, [image]);
    } catch {
      scope.postMessage({ id });
    }
  };
}

export function workerTrimmer(view: Window & typeof globalThis): LayerTrimmer | undefined {
  if (typeof view.Worker !== "function" || typeof view.Blob !== "function" || typeof view.URL?.createObjectURL !== "function") {
    return undefined;
  }
  let worker: Worker | undefined;
  let broken = false;
  let next = 0;
  let idle: number | undefined;
  const pending = new Map<number, (layer: TrimmedLayer | undefined) => void>();
  const stop = () => {
    if (idle !== undefined) view.clearTimeout(idle);
    idle = undefined;
    worker?.terminate();
    worker = undefined;
  };
  const fail = () => {
    broken = true;
    stop();
    for (const settle of pending.values()) settle(undefined);
    pending.clear();
  };
  const start = (): Worker | undefined => {
    if (worker || broken) return worker;
    try {
      const source = `const findBox = ${paintedBox.toString()};\n(${trimWorker.toString()})(self, findBox, ${TRIM_MARGIN});\n`;
      const url = view.URL.createObjectURL(new view.Blob([source], { type: "text/javascript" }));
      worker = new view.Worker(url);
      view.URL.revokeObjectURL(url);
    } catch {
      fail();
      return undefined;
    }
    worker.onerror = fail;
    worker.onmessage = (event: MessageEvent) => {
      const { id, image, box, width, height } = event.data as { id: number; image?: ImageBitmap; box?: PaintedBox; width?: number; height?: number };
      const settle = pending.get(id);
      pending.delete(id);
      const layer = image && box && width && height ? { image, box, width, height } : undefined;
      if (settle) settle(layer);
      else image?.close();
      if (pending.size === 0) idle = view.setTimeout(stop, TRIM_IDLE_MS);
    };
    return worker;
  };
  return (bytes, type) => {
    if (idle !== undefined) view.clearTimeout(idle);
    idle = undefined;
    const target = start();
    if (!target) return Promise.resolve(undefined);
    const id = ++next;
    return new Promise((resolve) => {
      pending.set(id, resolve);
      const copy = bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer;
      try {
        target.postMessage({ id, bytes: copy, type }, [copy as ArrayBuffer]);
      } catch {
        pending.delete(id);
        if (pending.size === 0) idle = view.setTimeout(stop, TRIM_IDLE_MS);
        resolve(undefined);
      }
    });
  };
}
