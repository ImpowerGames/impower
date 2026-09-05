// How a resident image is held (#433): as a CSS background on a hidden
// element for as long as it is resident, loaded before the completion-signal
// image so the browser reuses it for a later background, mask or `<img>`;
// how a gate is served (#434): never waiting for a slot a hint or a prefetch
// could take, pausing prefetches only while someone holds a gate pin, on
// whatever entry carries it, and leaving the express lane when nobody does;
// and what an SVG counts for: its parsed document, not a bitmap of its
// viewBox.

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
    cache.request([image("/y.png?v=1")], 0, "beat:1");
    cache.request([image("/z.png")], 0, "beat:2");
    expect(warmed.map((w) => w.removed)).toEqual([false, false, false]);
    // A drop of a pinned, still-loading picture.
    cache.release(["beat:1"], true);
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
    // A gate with more loads than the lane holds: six start at once,
    // the seventh queues, and none of them waits for a background slot.
    const gate = cache.request(images(7, "portrait"), 0, "restore");
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS + DEFAULT_MAX_CONCURRENT);
    expect(loading("/portrait6.svg")).toBeUndefined();
    // An explicit load's set is waited on too: it takes the background
    // slots as they free, whatever the express lane holds.
    void cache.request(images(2, "set"), 1, "load:B");
    expect(loading("/set0.svg")).toBeUndefined();
    loading("/bg0.svg")!.finishLoad();
    await settle();
    expect(loading("/set0.svg")).toBeDefined();
    expect(cache.inFlightCount).toBe(BACKGROUND_SLOTS + DEFAULT_MAX_CONCURRENT);
    // A prefetch does not: someone is waiting on the gate.
    loading("/bg1.svg")!.finishLoad();
    await settle();
    expect(loading("/set1.svg")).toBeDefined();
    loading("/bg2.svg")!.finishLoad();
    await settle();
    expect(loading("/bg4.svg")).toBeUndefined();
    // A gate slot freeing goes to the queued gate load.
    loading("/portrait0.svg")!.finishLoad();
    await settle();
    expect(loading("/portrait6.svg")).toBeDefined();
    for (let i = 1; i < 7; i++) {
      loading(`/portrait${i}.svg`)!.finishLoad();
    }
    await settle();
    await gate;
    // The gate settled: the background queue resumes.
    expect(loading("/bg4.svg")).toBeDefined();
  });

  it("stops pausing prefetches the moment a gate's pin is released, whatever the lane holds", async () => {
    const { cache, loading } = makeCache();
    // Six gate loads the service worker is slow to answer fill the lane.
    void cache.request(images(6, "slow"), 0, "restore");
    cache.prefetch([image("/after.svg")], 2);
    expect(loading("/after.svg")).toBeUndefined();
    // The engine gave up on the gate (its own timeout) and released the pin:
    // the page must not keep waiting on its behalf, and a full express lane
    // is no reason for a background slot to stay empty.
    cache.release(["restore"], false);
    expect(loading("/after.svg")).toBeDefined();
    expect(loading("/slow0.svg")).toBeDefined();
  });

  it("pauses prefetches for a gate queued behind a released gate's loads", async () => {
    const { cache, loading } = makeCache();
    // A gate the engine gave up on: its six loads keep their slots, unpinned.
    void cache.request(images(6, "old"), 0, "restore");
    cache.release(["restore"], false);
    // The next scrub's gate queues behind them. Someone waits on it, so no
    // prefetch starts while it is queued, though nothing pinned is loading.
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
    // The window went out first (the scene's opening backdrop among it),
    // then the restore gate asked for that backdrop.
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
    // A load's set on a hinted picture: requested at priority 1, so not a
    // gate, whatever its pin is called.
    cache.hint([image("/shared.svg")]);
    void cache.request([image("/shared.svg")], 1, "load:B");
    cache.prefetch([image("/w0.svg")], 2);
    expect(loading("/w0.svg")).toBeDefined();
    // A gate whose picture the author then saved over: nobody waits on it
    // any more, so it must not pause anything until its load settles.
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
    // A gate wider than the slots the hints left arrives while the hint's
    // leftovers are queued: it goes ahead of them in the lane, two of its
    // loads start at once, and every slot that frees goes to it before any
    // queued hint. The hint loads in flight cannot be taken back, so that
    // is the bound: a gate waits behind at most the four hint loads that
    // were already running, never behind a queued one.
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
    // A hint takes a freed slot only once no gate load is queued and fewer
    // than four express loads are in flight.
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
    // A cold service worker answers the gate's first attempt with a 404.
    loading("/g.svg")!.fail();
    await settle();
    // The retry goes back to the head of the lane, not behind the four
    // queued hints, and starts in the slot it freed; the hints stay queued
    // and nothing background moved meanwhile, since the gate was pending.
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
    const { cache, loading, priorityOf } = makeCache();
    // The window went out first, at the rest-of-scene priority; then the
    // gate asked for the same picture. The picture is a gate's now.
    cache.prefetch([image("/portrait.svg")], 3);
    expect(loading("/portrait.svg")).toBeDefined();
    void cache.request([image("/portrait.svg")], 0, "restore");
    expect(priorityOf("/portrait.svg")).toBe(0);
    cache.hint(images(6, "h"));
    // A cold service worker fails the first attempt: the retry goes to the
    // head of the express lane, not to the back of a queue that yields to
    // every gate, and starts in the next express slot.
    loading("/portrait.svg")!.fail();
    await settle();
    expect(loading("/portrait.svg")).toBeDefined();
    expect(cache.stateOf("/h4.svg")).toBe("queued");
  });

  it("retries a failed hint behind the hints that have not been tried", async () => {
    const { cache, loading, priorityOf } = makeCache();
    // A service worker that is coming up fails what it is asked first: every
    // picture gets a first attempt before any gets a second, so the ones
    // asked later, when the worker is up, load on their first.
    cache.hint(images(6, "h"));
    loading("/h0.svg")!.fail();
    await settle();
    expect(loading("/h4.svg")).toBeDefined();
    expect((cache as any)._queues[0].map((e: any) => e.key)).toEqual([
      "/h5.svg",
      "/h0.svg",
    ]);
    // A gate nobody waits on any more (its pin released while its load was
    // in flight) leaves the express lane on retry, as a queued one would
    // have on release: a prefetch now, behind every hint.
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
    // A beat gates a picture the load's set is already queued for.
    void cache.request([image("/b4.svg")], 0, "beat:1");
    expect(priorityOf("/b4.svg")).toBe(0);
    cache.release(["beat:1"], false);
    // Back to the priority the load asked for, not to a prefetch's: the
    // load is waited on too, and a prefetch would yield to the next gate.
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
      // The load fires and the decode settles: the decode's timer goes the
      // way the load's does, and nothing stays armed behind a resident
      // picture.
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
    // A background slot frees while the hint is still loading: background
    // work takes it, because nobody is waiting on a hint.
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
    // The cursor moved on before the last hint drained: what it left queued
    // goes back to the window's priority, so the new hint is next in the
    // express lane rather than behind every beat the cursor passed.
    cache.hint([image("/k0.svg")]);
    expect(priorityOf("/h4.svg")).toBe(2);
    expect(priorityOf("/h5.svg")).toBe(2);
    expect(priorityOf("/k0.svg")).toBe(0);
    loading("/h0.svg")!.finishLoad();
    await settle();
    expect(loading("/k0.svg")).toBeDefined();
    // What was loading when the cursor moved is still wanted, and stays.
    expect(loading("/h1.svg")).toBeDefined();
    // A cursor on a beat with no pictures hints nothing, and that too
    // retires the last hint's leftovers.
    cache.hint(images(3, "j"));
    cache.hint([]);
    expect(priorityOf("/j2.svg")).toBe(2);
  });

  it("takes a released gate's queued pictures out of the express lane", async () => {
    const { cache, loading, priorityOf } = makeCache();
    // Three scrubs, each gating eight pictures and giving up at the
    // engine's timeout before the lane drains.
    for (let scrub = 0; scrub < 3; scrub++) {
      void cache.request(images(8, `s${scrub}p`), 0, "restore");
      cache.release(["restore"], false);
    }
    // Nothing abandoned stays at priority 0; the lane holds only what is
    // loading.
    for (let scrub = 0; scrub < 3; scrub++) {
      for (let i = 0; i < 8; i++) {
        const src = `/s${scrub}p${i}.svg`;
        if (!loading(src)) {
          expect({ src, priority: priorityOf(src) }).toEqual({ src, priority: 2 });
        }
      }
    }
    expect((cache as any)._queues[0]).toEqual([]);
    // The fourth scrub's gate is next in the lane.
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
    // Someone is waiting on the load's set too (behind the loading layout),
    // so it takes background slots whatever the express lane holds.
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
    const { cache, created, loading } = makeCache();
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
    expect(created).toHaveLength(2);
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
