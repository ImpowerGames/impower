// How a resident image is held (#433): as a CSS background on a hidden
// element for as long as it is resident, because that is the one form of
// load the browser reuses for a later background, mask or `<img>`; and what
// an SVG counts for (#434): its parsed document, not a bitmap of its viewBox.

import { describe, expect, it, vi } from "vitest";
import {
  AssetCache,
  DEFAULT_LOAD_TIMEOUT_MS,
  type ImageTarget,
  type WarmHandle,
} from "./AssetCache";

class FakeImage implements ImageTarget {
  onload: ((this: any, ev: any) => any) | null = null;

  onerror: ((this: any, ev: any) => any) | null = null;

  naturalWidth = 300;

  naturalHeight = 150;

  done = false;

  src = "";

  finishLoad() {
    this.done = true;
    this.onload?.call(this, {});
  }

  fail() {
    this.done = true;
    this.onerror?.call(this, {});
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const MIB = 1024 * 1024;

const makeCache = () => {
  const images: FakeImage[] = [];
  const warmed: { src: string; removed: boolean }[] = [];
  const cache = new AssetCache({
    createImage: () => {
      const img = new FakeImage();
      images.push(img);
      return img;
    },
    warmImage: (src: string): WarmHandle => {
      const record = { src, removed: false };
      warmed.push(record);
      return {
        remove: () => {
          record.removed = true;
        },
      };
    },
  });
  const loading = (src: string) => images.find((i) => i.src === src && !i.done);
  return { cache, images, warmed, loading };
};

describe("AssetCache: warming through the document", () => {
  it("puts an image in the document as it loads and keeps it there while resident", async () => {
    const { cache, warmed, loading } = makeCache();
    const done = cache.request(
      [{ kind: "image", src: "/a.png" }],
      0,
      "beat:1",
    );
    // The element exists before the load completes: the fetch it starts is
    // the one the completion signal attaches to.
    expect(warmed).toEqual([{ src: "/a.png", removed: false }]);
    loading("/a.png")!.finishLoad();
    await settle();
    await done;
    expect(cache.isResident("/a.png")).toBe(true);
    expect(warmed[0]!.removed).toBe(false);
    // Leaving the cache takes the element with it.
    cache.release(["beat:1"], true);
    expect(cache.has("/a.png")).toBe(false);
    expect(warmed[0]!.removed).toBe(true);
  });

  it("removes the element when a load fails, when a file changes, and on dispose", async () => {
    const { cache, warmed, loading } = makeCache();
    cache.prefetch(
      [
        { kind: "image", src: "/bad.png" },
        { kind: "image", src: "/b.png?v=1" },
        { kind: "image", src: "/c.png" },
      ],
      2,
    );
    for (let i = 0; i < 3; i++) {
      loading("/bad.png")!.fail();
      await settle();
    }
    expect(cache.stateOf("/bad.png")).toBe("failed");
    expect(warmed.filter((w) => w.src === "/bad.png").every((w) => w.removed)).toBe(true);
    loading("/b.png?v=1")!.finishLoad();
    loading("/c.png")!.finishLoad();
    await settle();
    cache.evictFile("/b.png?v=2");
    expect(warmed.find((w) => w.src === "/b.png?v=1")!.removed).toBe(true);
    expect(warmed.find((w) => w.src === "/c.png")!.removed).toBe(false);
    cache.dispose();
    expect(warmed.find((w) => w.src === "/c.png")!.removed).toBe(true);
  });

  it("loads without a document too", async () => {
    const images: FakeImage[] = [];
    const cache = new AssetCache({
      createImage: () => {
        const img = new FakeImage();
        images.push(img);
        return img;
      },
    });
    const done = cache.request([{ kind: "image", src: "/a.png" }], 0, "p");
    images[0]!.finishLoad();
    await settle();
    expect((await done).loaded).toEqual(["/a.png"]);
  });

  it("starts no background load while a gate is queued or in flight", async () => {
    const { cache, loading } = makeCache();
    const bg = (n: number) => `/bg${n}.svg`;
    // Six background loads: four start (two slots are the express lane).
    cache.prefetch(
      Array.from({ length: 6 }, (_, i) => ({ kind: "image" as const, src: bg(i) })),
      2,
    );
    expect(cache.inFlightCount).toBe(4);
    // A gate arrives: it starts at once in an express slot.
    const gate = cache.request([{ kind: "image", src: "/portrait.svg" }], 0, "restore");
    expect(cache.inFlightCount).toBe(5);
    expect(loading("/portrait.svg")).toBeDefined();
    // A background load finishing frees a slot, but nothing background
    // takes it while the gate is still loading.
    loading(bg(0))!.finishLoad();
    await settle();
    expect(cache.inFlightCount).toBe(4);
    expect(loading(bg(4))).toBeUndefined();
    // The gate settles: the background queue resumes.
    loading("/portrait.svg")!.finishLoad();
    await settle();
    await gate;
    expect(loading(bg(4))).toBeDefined();
    expect(cache.inFlightCount).toBe(4);
  });

  it("fails a load that never settles, so it frees its slot and the queue behind a gate", async () => {
    vi.useFakeTimers();
    try {
      const { cache, loading } = makeCache();
      // A gate whose picture never fires load or error.
      const gate = cache.request([{ kind: "image", src: "/hung.svg" }], 0, "restore");
      cache.prefetch([{ kind: "image", src: "/next.svg" }], 2);
      expect(loading("/hung.svg")).toBeDefined();
      expect(loading("/next.svg")).toBeUndefined();
      // Well before the timeout nothing has moved.
      vi.advanceTimersByTime(DEFAULT_LOAD_TIMEOUT_MS - 1);
      expect(loading("/next.svg")).toBeUndefined();
      // At the timeout the hung load counts as failed outright, with no
      // retry (a hang is not a 404): the gate settles and the queue moves.
      await vi.advanceTimersByTimeAsync(1);
      expect((await gate).failed).toEqual(["/hung.svg"]);
      expect(cache.stateOf("/hung.svg")).toBe("failed");
      expect(loading("/next.svg")).toBeDefined();
      loading("/next.svg")!.finishLoad();
      await vi.advanceTimersByTimeAsync(0);
      expect(cache.isResident("/next.svg")).toBe(true);
      expect(cache.inFlightCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts an SVG as its parsed document, whatever its viewBox says", async () => {
    const { cache, images, loading } = makeCache();
    cache.prefetch(
      [
        { kind: "image", src: "/portrait.svg?v=1&filters=x" },
        { kind: "image", src: "/backdrop.webp" },
      ],
      2,
    );
    // A portrait drawn on a 5760 by 3240 viewBox would be 75 MB as a bitmap.
    const svg = loading("/portrait.svg?v=1&filters=x")!;
    svg.naturalWidth = 5760;
    svg.naturalHeight = 3240;
    svg.finishLoad();
    const webp = loading("/backdrop.webp")!;
    webp.naturalWidth = 1920;
    webp.naturalHeight = 1080;
    webp.finishLoad();
    await settle();
    const stats = cache.stats();
    expect(stats.bytes.image).toBe(1 * MIB + 1920 * 1080 * 4);
    expect(images).toHaveLength(2);
    // Three hundred portraits fit the default pool where sixty did before.
    cache.configure({ predictBytes: 300 * MIB });
    expect(cache.residentCount).toBe(2);
  });
});
