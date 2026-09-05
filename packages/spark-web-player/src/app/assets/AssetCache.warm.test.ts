// How a resident image is held (#433): as a CSS background on a hidden
// element for as long as it is resident, loaded before the completion-signal
// image so the browser reuses it for a later background, mask or `<img>`;
// how a gate is served (#434): never waiting for a slot, pausing prefetches
// only while someone holds its pin, and never held up by the page's own hint;
// and what an SVG counts for: its parsed document, not a bitmap of its
// viewBox.

import { type AssetItem } from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { describe, expect, it, vi } from "vitest";
import {
  AssetCache,
  DEFAULT_LOAD_TIMEOUT_MS,
  DEFAULT_MAX_CONCURRENT,
  type ImageTarget,
  type WarmHandle,
} from "./AssetCache";

class FakeImage implements ImageTarget {
  onload: ((this: any, ev: any) => any) | null = null;

  onerror: ((this: any, ev: any) => any) | null = null;

  naturalWidth = 300;

  naturalHeight = 150;

  done = false;

  protected _src = "";

  constructor(protected _log?: string[]) {}

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
    this._log?.push(`src:${value}`);
  }

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

const image = (src: string): AssetItem => ({ kind: "image", src });

const makeCache = (options?: ConstructorParameters<typeof AssetCache>[1]) => {
  const images: FakeImage[] = [];
  const warmed: { src: string; removed: boolean }[] = [];
  const log: string[] = [];
  const cache = new AssetCache(
    {
      createImage: () => {
        const img = new FakeImage(log);
        images.push(img);
        return img;
      },
      warmImage: (src: string): WarmHandle => {
        const record = { src, removed: false };
        warmed.push(record);
        log.push(`warm:${src}`);
        return {
          remove: () => {
            record.removed = true;
          },
        };
      },
    },
    options,
  );
  const loading = (src: string) => images.find((i) => i.src === src && !i.done);
  const finish = async (src: string) => {
    loading(src)!.finishLoad();
    await settle();
  };
  return { cache, images, warmed, log, loading, finish };
};

describe("AssetCache: warming through the document", () => {
  it("puts an image in the document before its load starts, and keeps it there while resident", async () => {
    const { cache, warmed, log, loading } = makeCache();
    const done = cache.request([image("/a.png")], 0, "beat:1");
    // The element comes first: its CSS fetch is the one the image object
    // then attaches to, which is the order the browser reuses later.
    expect(log).toEqual(["warm:/a.png", "src:/a.png"]);
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
      [image("/bad.png"), image("/b.png?v=1"), image("/c.png")],
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

  it("removes the element the moment a loading entry is dropped, changed, or disposed", async () => {
    const { cache, warmed, loading } = makeCache();
    cache.prefetch([image("/x.png")], 2);
    cache.request([image("/y.png?v=1")], 0, "load:A");
    cache.request([image("/z.png")], 0, "load:B");
    expect(warmed.map((w) => w.removed)).toEqual([false, false, false]);
    // A drop of a pinned, still-loading picture.
    cache.release(["load:A"], true);
    expect(warmed.find((w) => w.src === "/y.png?v=1")!.removed).toBe(true);
    // The file behind a loading picture changed.
    cache.evictFile("/x.png?v=2");
    expect(warmed.find((w) => w.src === "/x.png")!.removed).toBe(true);
    // The page went away with a load in flight.
    cache.dispose();
    expect(warmed.find((w) => w.src === "/z.png")!.removed).toBe(true);
    // What arrives afterwards belongs to nobody and holds nothing.
    loading("/z.png")!.finishLoad();
    await settle();
    expect(cache.has("/z.png")).toBe(false);
    expect(warmed.filter((w) => !w.removed)).toEqual([]);
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
    const done = cache.request([image("/a.png")], 0, "p");
    images[0]!.finishLoad();
    await settle();
    expect((await done).loaded).toEqual(["/a.png"]);
  });

  it("starts no prefetch while a pinned gate is queued or in flight, and resumes when it settles", async () => {
    const { cache, loading } = makeCache();
    const bg = (n: number) => `/bg${n}.svg`;
    // Six background loads: four start (two slots are the express lane).
    cache.prefetch(Array.from({ length: 6 }, (_, i) => image(bg(i))), 2);
    expect(cache.inFlightCount).toBe(4);
    // A gate with more loads than the lane holds: six start at once, the
    // seventh queues, and none of them waits for a background slot.
    const gate = cache.request(
      Array.from({ length: 7 }, (_, i) => image(`/portrait${i}.svg`)),
      0,
      "restore",
    );
    expect(cache.inFlightCount).toBe(4 + DEFAULT_MAX_CONCURRENT);
    expect(loading("/portrait6.svg")).toBeUndefined();
    // A background load finishing frees a slot; nothing background takes it
    // while a gate load is queued, then while gate loads are in flight.
    loading(bg(0))!.finishLoad();
    await settle();
    expect(loading(bg(4))).toBeUndefined();
    loading("/portrait0.svg")!.finishLoad();
    await settle();
    expect(loading("/portrait6.svg")).toBeDefined();
    expect(loading(bg(4))).toBeUndefined();
    for (let i = 1; i < 7; i++) {
      loading(`/portrait${i}.svg`)!.finishLoad();
    }
    await settle();
    await gate;
    // The gate settled: the background queue resumes.
    expect(loading(bg(4))).toBeDefined();
    expect(cache.inFlightCount).toBe(4);
  });

  it("stops pausing prefetches the moment a gate's pin is released, settled or not", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch([image("/next.svg"), image("/later.svg")], 2);
    loading("/next.svg")!.finishLoad();
    loading("/later.svg")!.finishLoad();
    await settle();
    cache.prefetch([image("/queued.svg")], 3);
    expect(loading("/queued.svg")).toBeDefined();
    loading("/queued.svg")!.finishLoad();
    await settle();
    // A gate whose picture the service worker is slow to answer.
    void cache.request([image("/slow.svg")], 0, "restore");
    cache.prefetch([image("/after.svg")], 2);
    expect(loading("/after.svg")).toBeUndefined();
    // The engine gave up on the gate (its own timeout) and released the pin:
    // the page must not keep waiting on its behalf.
    cache.release(["restore"], false);
    expect(loading("/after.svg")).toBeDefined();
    expect(loading("/slow.svg")).toBeDefined();
  });

  it("never pauses prefetches for the page's own hint", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch(Array.from({ length: 4 }, (_, i) => image(`/bg${i}.svg`)), 2);
    expect(cache.inFlightCount).toBe(4);
    // A hint: unpinned, in the express lane at once.
    cache.hint([image("/h0.svg")]);
    expect(loading("/h0.svg")).toBeDefined();
    cache.prefetch([image("/bg4.svg")], 2);
    expect(loading("/bg4.svg")).toBeUndefined();
    // A background slot frees while the hint is still loading: background
    // work takes it, because nobody is waiting on a hint.
    loading("/bg0.svg")!.finishLoad();
    await settle();
    expect(loading("/bg4.svg")).toBeDefined();
    expect(loading("/h0.svg")).toBeDefined();
  });

  it("lets a new hint replace what the last one left queued", async () => {
    const { cache, loading } = makeCache();
    const priorityOf = (src: string) =>
      (cache as any)._entries.get(src)?.priority as number | undefined;
    cache.hint(Array.from({ length: 8 }, (_, i) => image(`/h${i}.svg`)));
    expect(cache.inFlightCount).toBe(DEFAULT_MAX_CONCURRENT);
    expect(cache.stateOf("/h6.svg")).toBe("queued");
    expect(priorityOf("/h6.svg")).toBe(0);
    // The cursor moved on before the last hint drained: what it left queued
    // goes back to the window's priority, so the new hint is next in the
    // express lane rather than behind every beat the cursor passed.
    cache.hint([image("/k0.svg")]);
    expect(priorityOf("/h6.svg")).toBe(2);
    expect(priorityOf("/h7.svg")).toBe(2);
    expect(priorityOf("/k0.svg")).toBe(0);
    loading("/h0.svg")!.finishLoad();
    await settle();
    expect(loading("/k0.svg")).toBeDefined();
    expect(loading("/h6.svg")).toBeUndefined();
    // What was loading when the cursor moved is still wanted, and stays.
    expect(loading("/h1.svg")).toBeDefined();
  });

  it("keeps an explicit load's set moving while a gate is in flight", async () => {
    const { cache, loading } = makeCache();
    void cache.request([image("/font-ish.svg")], 0, "layout:loading");
    void cache.request(
      Array.from({ length: 3 }, (_, i) => image(`/set${i}.svg`)),
      1,
      "load:B",
    );
    // Someone is waiting on the load's set too (behind the loading layout),
    // so it takes background slots as before.
    expect(loading("/set0.svg")).toBeDefined();
    expect(loading("/set2.svg")).toBeDefined();
  });

  it("fails a load that never settles, so it frees its slot and the queue behind a gate", async () => {
    vi.useFakeTimers();
    try {
      const { cache, loading } = makeCache();
      // A gate whose picture never fires load or error.
      const gate = cache.request([image("/hung.svg")], 0, "restore");
      cache.prefetch([image("/next.svg")], 2);
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
      // A load that settled leaves no timer armed behind it.
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts an SVG as its parsed document, whatever its viewBox says", async () => {
    const { cache, images, loading } = makeCache();
    cache.prefetch(
      [image("/portrait.svg?v=1&filters=x"), image("/backdrop.webp")],
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
  });

  it("keeps an act's worth of portraits in a pool that held sixty before", async () => {
    // Two hundred portraits against a 250 MB pool: every one stays. At the
    // old 4 MiB floor the pool would have held sixty of them.
    const { cache, loading } = makeCache({ predictBytes: 250 * MIB });
    const srcs = Array.from({ length: 200 }, (_, i) => `/p${i}.svg?filters=x`);
    for (let i = 0; i < srcs.length; i += 4) {
      cache.prefetch(srcs.slice(i, i + 4).map(image), 3);
      for (const src of srcs.slice(i, i + 4)) {
        loading(src)!.finishLoad();
      }
      await settle();
    }
    expect(cache.residentCount).toBe(200);
    expect(cache.stats().bytes.image).toBe(200 * MIB);
  });
});
