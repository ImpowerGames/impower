import { type AssetItem } from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { describe, expect, it, vi } from "vitest";
import {
  AssetCache,
  DEFAULT_EXPRESS_SLOTS,
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

const BACKGROUND_SLOTS = DEFAULT_MAX_CONCURRENT - DEFAULT_EXPRESS_SLOTS;

const image = (src: string): AssetItem => ({ kind: "image", src });

const images = (n: number, prefix: string): AssetItem[] =>
  Array.from({ length: n }, (_, i) => image(`/${prefix}${i}.svg`));

const makeCache = (options?: ConstructorParameters<typeof AssetCache>[1]) => {
  const created: FakeImage[] = [];
  const warmed: { src: string; removed: boolean }[] = [];
  const log: string[] = [];
  const cache = new AssetCache(
    {
      createImage: () => {
        const img = new FakeImage(log);
        created.push(img);
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
  const loading = (src: string) => created.find((i) => i.src === src && !i.done);
  const finish = async (src: string) => {
    loading(src)!.finishLoad();
    await settle();
  };
  const priorityOf = (src: string) =>
    (cache as any)._entries.get(src)?.priority as number | undefined;
  return { cache, created, warmed, log, loading, finish, priorityOf };
};

describe("AssetCache: warming through the document", () => {
  it("puts an image in the document before its load starts, and keeps it there while resident", async () => {
    const { cache, warmed, log, loading } = makeCache();
    const done = cache.request([image("/a.png")], 0, "beat:1");
    expect(log).toEqual(["warm:/a.png", "src:/a.png"]);
    expect(warmed).toEqual([{ src: "/a.png", removed: false }]);
    loading("/a.png")!.finishLoad();
    await settle();
    await done;
    expect(cache.isResident("/a.png")).toBe(true);
    expect(warmed[0]!.removed).toBe(false);
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
    cache.request([image("/y.png?v=1")], 0, "beat:1");
    cache.request([image("/z.png")], 0, "beat:2");
    expect(warmed.map((w) => w.removed)).toEqual([false, false, false]);
    cache.release(["beat:1"], true);
    expect(warmed.find((w) => w.src === "/y.png?v=1")!.removed).toBe(true);
    cache.evictFile("/x.png?v=2");
    expect(warmed.find((w) => w.src === "/x.png")!.removed).toBe(true);
    cache.dispose();
    expect(warmed.find((w) => w.src === "/z.png")!.removed).toBe(true);
    loading("/z.png")!.finishLoad();
    await settle();
    expect(cache.has("/z.png")).toBe(false);
    expect(warmed.filter((w) => !w.removed)).toEqual([]);
  });

  it("loads without a document too", async () => {
    const created: FakeImage[] = [];
    const cache = new AssetCache({
      createImage: () => {
        const img = new FakeImage();
        created.push(img);
        return img;
      },
    });
    const done = cache.request([image("/a.png")], 0, "p");
    created[0]!.finishLoad();
    await settle();
    expect((await done).loaded).toEqual(["/a.png"]);
  });

  it("runs the express lane beside the background lane, not inside it", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch(images(6, "bg"), 2);
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS);
    const gate = cache.request(images(7, "portrait"), 0, "restore");
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS + DEFAULT_MAX_CONCURRENT);
    expect(loading("/portrait6.svg")).toBeUndefined();
    void cache.request(images(2, "set"), 1, "load:B");
    expect(loading("/set0.svg")).toBeUndefined();
    loading("/bg0.svg")!.finishLoad();
    await settle();
    expect(loading("/set0.svg")).toBeDefined();
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS + DEFAULT_MAX_CONCURRENT);
    loading("/bg1.svg")!.finishLoad();
    await settle();
    expect(loading("/set1.svg")).toBeDefined();
    loading("/bg2.svg")!.finishLoad();
    await settle();
    expect(loading("/bg4.svg")).toBeUndefined();
    loading("/portrait0.svg")!.finishLoad();
    await settle();
    expect(loading("/portrait6.svg")).toBeDefined();
    for (let i = 1; i < 7; i++) {
      loading(`/portrait${i}.svg`)!.finishLoad();
    }
    await settle();
    await gate;
    expect(loading("/bg4.svg")).toBeDefined();
  });

  it("stops pausing prefetches the moment a gate's pin is released, whatever the lane holds", async () => {
    const { cache, loading } = makeCache();
    void cache.request(images(6, "slow"), 0, "restore");
    cache.prefetch([image("/after.svg")], 2);
    expect(loading("/after.svg")).toBeUndefined();
    cache.release(["restore"], false);
    expect(loading("/after.svg")).toBeDefined();
    expect(loading("/slow0.svg")).toBeDefined();
  });

  it("pauses prefetches for a gate queued behind a released gate's loads", async () => {
    const { cache, loading } = makeCache();
    void cache.request(images(6, "old"), 0, "restore");
    cache.release(["restore"], false);
    void cache.request([image("/new.svg")], 0, "restore");
    expect(loading("/new.svg")).toBeUndefined();
    cache.prefetch([image("/w.svg")], 2);
    expect(loading("/w.svg")).toBeUndefined();
    loading("/old0.svg")!.finishLoad();
    await settle();
    expect(loading("/new.svg")).toBeDefined();
    expect(loading("/w.svg")).toBeUndefined();
    loading("/new.svg")!.finishLoad();
    await settle();
    expect(loading("/w.svg")).toBeDefined();
  });

  it("counts a gate that pins a picture a prefetch already had in flight", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch([image("/backdrop.svg")], 2);
    expect(loading("/backdrop.svg")).toBeDefined();
    void cache.request([image("/backdrop.svg")], 0, "restore");
    cache.prefetch([image("/next.svg")], 2);
    expect(loading("/next.svg")).toBeUndefined();
    loading("/backdrop.svg")!.finishLoad();
    await settle();
    expect(loading("/next.svg")).toBeDefined();
  });

  it("does not count a priority-1 pin, a hint, or an entry the cache has forgotten", async () => {
    const { cache, loading } = makeCache();
    cache.hint([image("/shared.svg")]);
    void cache.request([image("/shared.svg")], 1, "load:B");
    cache.prefetch([image("/w0.svg")], 2);
    expect(loading("/w0.svg")).toBeDefined();
    void cache.request([image("/gone.svg?v=1")], 0, "restore");
    cache.prefetch([image("/w1.svg")], 2);
    expect(loading("/w1.svg")).toBeUndefined();
    cache.evictFile("/gone.svg?v=2");
    expect(loading("/w1.svg")).toBeDefined();
  });

  it("leaves a hint two express slots short, so a gate always has slots hints cannot take", async () => {
    const { cache, loading } = makeCache();
    cache.hint(images(8, "h"));
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS);
    expect(loading("/h4.svg")).toBeUndefined();
    void cache.request(images(6, "gate"), 0, "restore");
    expect(loading("/gate0.svg")).toBeDefined();
    expect(loading("/gate1.svg")).toBeDefined();
    expect(loading("/gate2.svg")).toBeUndefined();
    expect(loading("/h4.svg")).toBeUndefined();
    for (let i = 0; i < 4; i++) {
      loading(`/h${i}.svg`)!.finishLoad();
      await settle();
      expect(loading(`/gate${i + 2}.svg`)).toBeDefined();
      expect(loading("/h4.svg")).toBeUndefined();
    }
    for (let i = 0; i < 2; i++) {
      loading(`/gate${i}.svg`)!.finishLoad();
      await settle();
      expect(loading("/h4.svg")).toBeUndefined();
    }
    loading("/gate2.svg")!.finishLoad();
    await settle();
    expect(loading("/h4.svg")).toBeDefined();
  });

  it("re-queues a gate that failed once ahead of the hints", async () => {
    const { cache, loading } = makeCache();
    cache.hint(images(8, "h"));
    void cache.request([image("/g.svg")], 0, "beat:1");
    expect(loading("/g.svg")).toBeDefined();
    loading("/g.svg")!.fail();
    await settle();
    expect(loading("/g.svg")).toBeDefined();
    expect(cache.stateOf("/h4.svg")).toBe("queued");
    expect((cache as any)._queues[0].map((e: any) => e.key)).toEqual([
      "/h4.svg",
      "/h5.svg",
      "/h6.svg",
      "/h7.svg",
    ]);
  });

  it("retries a gate's picture in the express lane when a prefetch had it in flight first", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch([image("/portrait.svg")], 3);
    expect(loading("/portrait.svg")).toBeDefined();
    void cache.request([image("/portrait.svg")], 0, "restore");
    void cache.request([image("/backdrop.svg")], 0, "restore");
    expect(loading("/backdrop.svg")).toBeDefined();
    loading("/portrait.svg")!.fail();
    await settle();
    expect(cache.stateOf("/portrait.svg")).toBe("loading");
    expect(loading("/portrait.svg")).toBeDefined();
  });

  it("retries a failed hint behind the hints that have not been tried", async () => {
    const { cache, loading, priorityOf } = makeCache();
    cache.hint(images(6, "h"));
    loading("/h0.svg")!.fail();
    await settle();
    expect(loading("/h4.svg")).toBeDefined();
    expect((cache as any)._queues[0].map((e: any) => e.key)).toEqual([
      "/h5.svg",
      "/h0.svg",
    ]);
    void cache.request([image("/old.svg")], 0, "beat:old");
    cache.release(["beat:old"], false);
    loading("/old.svg")!.fail();
    await settle();
    expect(priorityOf("/old.svg")).toBe(2);
    expect((cache as any)._queues[0].map((e: any) => e.key)).not.toContain(
      "/old.svg",
    );
  });

  it("sends a released gate's picture back to the load's priority when a load still waits on it", async () => {
    const { cache, loading, priorityOf } = makeCache();
    void cache.request(images(5, "b"), 1, "load:X");
    expect(cache.stateOf("/b4.svg")).toBe("queued");
    void cache.request(images(6, "g"), 0, "restore");
    void cache.request([image("/b4.svg")], 0, "beat:1");
    expect(priorityOf("/b4.svg")).toBe(0);
    cache.release(["beat:1"], false);
    expect(priorityOf("/b4.svg")).toBe(1);
    loading("/b0.svg")!.finishLoad();
    await settle();
    expect(loading("/b4.svg")).toBeDefined();
  });

  it("retires a hinted picture an explicit load also wants to the load's priority", async () => {
    const { cache, priorityOf } = makeCache();
    cache.hint(images(8, "h"));
    void cache.request([image("/h5.svg")], 1, "load:B");
    expect(priorityOf("/h5.svg")).toBe(0);
    cache.hint([image("/k0.svg")]);
    expect(priorityOf("/h4.svg")).toBe(2);
    expect(priorityOf("/h5.svg")).toBe(1);
  });

  it("clears the decode timer with the load's", async () => {
    vi.useFakeTimers();
    try {
      class DecodingImage extends FakeImage {
        decode = () => Promise.resolve();
      }
      const created: DecodingImage[] = [];
      const cache = new AssetCache({
        createImage: () => {
          const img = new DecodingImage();
          created.push(img);
          return img;
        },
      });
      const done = cache.request([image("/a.png")], 0, "restore");
      expect(created).toHaveLength(1);
      created[0]!.finishLoad();
      await vi.advanceTimersByTimeAsync(0);
      await done;
      expect(cache.isResident("/a.png")).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never pauses prefetches for the page's own hint", async () => {
    const { cache, loading } = makeCache();
    cache.prefetch(images(4, "bg"), 2);
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS);
    cache.hint([image("/h0.svg")]);
    expect(loading("/h0.svg")).toBeDefined();
    cache.prefetch([image("/bg4.svg")], 2);
    expect(loading("/bg4.svg")).toBeUndefined();
    loading("/bg0.svg")!.finishLoad();
    await settle();
    expect(loading("/bg4.svg")).toBeDefined();
    expect(loading("/h0.svg")).toBeDefined();
  });

  it("lets a new hint, even an empty one, replace what the last one left queued", async () => {
    const { cache, loading, priorityOf } = makeCache();
    cache.hint(images(6, "h"));
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS);
    expect(cache.stateOf("/h4.svg")).toBe("queued");
    expect(priorityOf("/h4.svg")).toBe(0);
    cache.hint([image("/k0.svg")]);
    expect(priorityOf("/h4.svg")).toBe(2);
    expect(priorityOf("/h5.svg")).toBe(2);
    expect(priorityOf("/k0.svg")).toBe(0);
    loading("/h0.svg")!.finishLoad();
    await settle();
    expect(loading("/k0.svg")).toBeDefined();
    expect(loading("/h1.svg")).toBeDefined();
    cache.hint(images(3, "j"));
    cache.hint([]);
    expect(priorityOf("/j2.svg")).toBe(2);
  });

  it("takes a released gate's queued pictures out of the express lane", async () => {
    const { cache, loading, priorityOf } = makeCache();
    for (let scrub = 0; scrub < 3; scrub++) {
      void cache.request(images(8, `s${scrub}p`), 0, "restore");
      cache.release(["restore"], false);
    }
    for (let scrub = 0; scrub < 3; scrub++) {
      for (let i = 0; i < 8; i++) {
        const src = `/s${scrub}p${i}.svg`;
        if (!loading(src)) {
          expect({ src, priority: priorityOf(src) }).toEqual({ src, priority: 2 });
        }
      }
    }
    expect((cache as any)._queues[0]).toEqual([]);
    void cache.request([image("/wanted.svg")], 0, "restore");
    expect(cache.stateOf("/wanted.svg")).toBe("queued");
    loading("/s0p0.svg")!.finishLoad();
    await settle();
    expect(loading("/wanted.svg")).toBeDefined();
  });

  it("keeps an explicit load's set moving while a gate is in flight", async () => {
    const { cache, loading } = makeCache();
    void cache.request(images(6, "font-ish"), 0, "layout:loading");
    void cache.request(images(3, "set"), 1, "load:B");
    expect(loading("/set0.svg")).toBeDefined();
    expect(loading("/set2.svg")).toBeDefined();
  });

  it("fails a load that never settles, so it frees its slot and the queue behind a gate", async () => {
    vi.useFakeTimers();
    try {
      const { cache, loading } = makeCache();
      const gate = cache.request([image("/hung.svg")], 0, "restore");
      cache.prefetch([image("/next.svg")], 2);
      expect(loading("/hung.svg")).toBeDefined();
      expect(loading("/next.svg")).toBeUndefined();
      vi.advanceTimersByTime(DEFAULT_LOAD_TIMEOUT_MS - 1);
      expect(loading("/next.svg")).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      expect((await gate).failed).toEqual(["/hung.svg"]);
      expect(cache.stateOf("/hung.svg")).toBe("failed");
      expect(loading("/next.svg")).toBeDefined();
      loading("/next.svg")!.finishLoad();
      await vi.advanceTimersByTimeAsync(0);
      expect(cache.isResident("/next.svg")).toBe(true);
      expect(cache.inFlightCount).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts an SVG as its parsed document, whatever its viewBox says", async () => {
    const { cache, created, loading } = makeCache();
    cache.prefetch(
      [image("/portrait.svg?v=1&filters=x"), image("/backdrop.webp")],
      2,
    );
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
    expect(created).toHaveLength(2);
  });

  it("keeps an act's worth of portraits in a pool that held sixty before", async () => {
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
