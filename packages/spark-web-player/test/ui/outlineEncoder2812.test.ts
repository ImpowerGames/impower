import { afterEach, describe, expect, test, vi } from "vitest";
import { browserOutlineEncoder } from "../../src/app/morph/MorphPlayback";

type Reply = "blob" | "none" | "error" | "unreadable" | "silent" | "refused";

afterEach(() => {
  vi.useRealTimers();
});

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
  const terminated: FakeWorker[] = [];
  class FakeWorker {
    onmessage: ((event: { data: unknown }) => void) | null = null;
    onerror: (() => void) | null = null;
    onmessageerror: (() => void) | null = null;
    constructor() {
      if (reply === "refused") throw new TypeError("This document requires 'TrustedScriptURL' assignment.");
    }
    postMessage(data: { id: number; image: unknown }, transfer: unknown[]) {
      posted.push({ data, transfer });
      if (reply === "silent") return;
      queueMicrotask(() => {
        if (reply === "error") this.onerror?.();
        else if (reply === "unreadable") this.onmessageerror?.();
        else this.onmessage?.({ data: reply === "blob" ? { id: data.id, blob } : { id: data.id } });
      });
    }
    terminate() {
      terminated.push(this);
    }
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
  return { canvas, toBlob, posted, sources, bitmaps, view, terminated };
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

  test("a worker whose message cannot be read leaves the encoding to toBlob, and later outlines skip the worker", async () => {
    const t = page("unreadable");
    expect((await browserOutlineEncoder(t.canvas))?.url).toBe("blob:page");
    expect(t.terminated).toHaveLength(1);
    expect((await browserOutlineEncoder(t.canvas))?.url).toBe("blob:page");
    expect(t.posted).toHaveLength(1);
    expect(t.toBlob).toHaveBeenCalledTimes(2);
  });

  test("a worker that never answers leaves every waiting outline to toBlob once its answer is overdue", async () => {
    vi.useFakeTimers();
    const t = page("silent");
    const first = browserOutlineEncoder(t.canvas);
    const second = browserOutlineEncoder(t.canvas);
    await vi.advanceTimersByTimeAsync(0);
    expect(t.posted).toHaveLength(2);
    expect(t.toBlob).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(60_000);
    expect((await first)?.url).toBe("blob:page");
    expect((await second)?.url).toBe("blob:page");
    expect(t.toBlob).toHaveBeenCalledTimes(2);
    expect(t.terminated).toHaveLength(1);
  });

  test("a worker the page refuses to start releases its script URL and leaves the encoding to toBlob", async () => {
    const t = page("refused");
    const encoded = await browserOutlineEncoder(t.canvas);
    expect(encoded?.url).toBe("blob:page");
    expect(t.view.URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
    expect(t.posted).toHaveLength(0);
    expect(t.bitmaps[0]!.close).toHaveBeenCalled();
  });

  test("an answered outline releases the worker's script URL and settles no other request", async () => {
    const t = page("blob");
    const [a, b] = await Promise.all([browserOutlineEncoder(t.canvas), browserOutlineEncoder(t.canvas)]);
    expect([a?.url, b?.url]).toEqual(["blob:worker", "blob:worker"]);
    expect(t.view.URL.revokeObjectURL).toHaveBeenCalledWith("blob:source");
    expect(t.toBlob).not.toHaveBeenCalled();
  });

  test("a page without OffscreenCanvas encodes with toBlob as before", async () => {
    const t = page("blob", { offscreen: false });
    const encoded = await browserOutlineEncoder(t.canvas);
    expect(t.posted).toHaveLength(0);
    expect(t.toBlob).toHaveBeenCalledTimes(1);
    expect(encoded?.url).toBe("blob:page");
  });
});
