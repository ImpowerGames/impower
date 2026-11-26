import { describe, expect, test, vi } from "vitest";
import { browserOutlineEncoder } from "../../src/app/morph/MorphPlayback";

type Reply = "blob" | "none" | "error";

function page(reply: Reply, options: { offscreen?: boolean } = {}) {
  const blob = { kind: "worker png" };
  const posted: { data: { id: number; image: unknown }; transfer: unknown[] }[] = [];
  const sources: string[] = [];
  const bitmaps: { width: number; height: number; close: ReturnType<typeof vi.fn> }[] = [];
  class FakeBlob {
    constructor(readonly parts: string[]) {
      sources.push(parts.join(""));
    }
  }
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    postMessage(data: { id: number; image: unknown }, transfer: unknown[]) {
      posted.push({ data, transfer });
      queueMicrotask(() => {
        if (reply === "error") this.onerror?.();
        else this.onmessage?.({ data: reply === "blob" ? { id: data.id, blob } : { id: data.id } });
      });
    }
    terminate() {}
  }
  class FakeImage {
    src = "";
    crossOrigin = "";
    decode() {
      return Promise.resolve();
    }
  }
  const view = {
    Worker: FakeWorker,
    Blob: FakeBlob,
    URL: { createObjectURL: vi.fn((value: unknown) => (value === blob ? "blob:worker" : value instanceof FakeBlob ? "blob:source" : "blob:page")), revokeObjectURL: vi.fn() },
    createImageBitmap: vi.fn(async (canvas: { width: number; height: number }) => {
      const bitmap = { width: canvas.width, height: canvas.height, close: vi.fn() };
      bitmaps.push(bitmap);
      return bitmap;
    }),
    ...(options.offscreen === false ? {} : { OffscreenCanvas: class {} }),
    setTimeout: (callback: () => void, ms: number) => setTimeout(callback, ms) as unknown as number,
    clearTimeout: (handle: number) => clearTimeout(handle),
    Image: FakeImage,
  };
  const toBlob = vi.fn((callback: (value: unknown) => void) => callback({ kind: "page png" }));
  const canvas = { ownerDocument: { defaultView: view }, width: 736, height: 552, toBlob } as unknown as HTMLCanvasElement;
  return { canvas, toBlob, posted, sources, bitmaps, view };
}

describe("a picture's shadow outline is encoded off the page thread (#2812)", () => {
  test("its pixels are taken as an image bitmap and encoded to PNG in a worker, with no toBlob on the page", async () => {
    const t = page("blob");
    const encoded = await browserOutlineEncoder(t.canvas);
    expect(encoded?.url).toBe("blob:worker");
    expect(t.toBlob).not.toHaveBeenCalled();
    expect(t.view.createImageBitmap).toHaveBeenCalledWith(t.canvas);
    expect(t.posted).toHaveLength(1);
    expect(t.posted[0]!.transfer).toEqual([t.bitmaps[0]]);
    expect(t.posted[0]!.data.image).toBe(t.bitmaps[0]);
    expect(t.sources.some((source) => source.includes("convertToBlob") && source.includes("OffscreenCanvas"))).toBe(true);
    encoded!.release();
    expect(t.view.URL.revokeObjectURL).toHaveBeenCalledWith("blob:worker");
  });

  test("a worker that answers without a PNG, or fails, leaves the encoding to toBlob as before", async () => {
    for (const reply of ["none", "error"] as const) {
      const t = page(reply);
      const encoded = await browserOutlineEncoder(t.canvas);
      expect(t.posted).toHaveLength(1);
      expect(t.toBlob).toHaveBeenCalledTimes(1);
      expect(encoded?.url).toBe("blob:page");
    }
  });

  test("a page without OffscreenCanvas encodes with toBlob as before", async () => {
    const t = page("blob", { offscreen: false });
    const encoded = await browserOutlineEncoder(t.canvas);
    expect(t.posted).toHaveLength(0);
    expect(t.toBlob).toHaveBeenCalledTimes(1);
    expect(encoded?.url).toBe("blob:page");
  });
});
