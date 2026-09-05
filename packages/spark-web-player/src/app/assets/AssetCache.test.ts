// The page's asset cache: what it loads, in what order, what it keeps, and
// what it lets go of (docs/engine/asset-preloading-spec.md). The concurrency
// and retry rules come from #344: warming is only useful if it keys on the
// url the renderer will request and does not queue every asset behind every
// other one.

import {
  type ImageAssetItem,
} from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { type AssetsProgressParams } from "../../../../spark-engine/src/game/modules/assets/types/AssetsProgressParams";
import { describe, expect, it } from "vitest";
import {
  AssetCache,
  DEFAULT_EXPRESS_SLOTS,
  DEFAULT_MAX_CONCURRENT,
  FAILED_RETRY_COOLDOWN_MS,
  MAX_LOAD_ATTEMPTS,
  type ImageTarget,
} from "./AssetCache";

class FakeImage implements ImageTarget {
  onload: ((this: any, ev: any) => any) | null = null;

  onerror: ((this: any, ev: any) => any) | null = null;

  naturalWidth = 1000;

  naturalHeight = 1000;

  decode?: () => Promise<void>;

  done = false;

  protected _src = "";

  get src() {
    return this._src;
  }

  set src(value: string) {
    this._src = value;
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

/** Let the load promises inside the cache settle. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

const makeCache = (options?: ConstructorParameters<typeof AssetCache>[1]) => {
  const created: FakeImage[] = [];
  const cache = new AssetCache(
    { createImage: () => {
        const img = new FakeImage();
        created.push(img);
        return img;
      },
    },
    options,
  );
  const inFlight = () => created.filter((i) => i.src && !i.done);
  const find = (src: string) => created.find((i) => i.src === src && !i.done);
  const finish = async (src: string) => {
    const img = find(src);
    if (!img) {
      throw new Error(`${src} is not loading`);
    }
    img.finishLoad();
    await settle();
  };
  const fail = async (src: string) => {
    const img = find(src);
    if (!img) {
      throw new Error(`${src} is not loading`);
    }
    img.fail();
    await settle();
  };
  return { cache, created, inFlight, find, finish, fail };
};

const image = (src: string): ImageAssetItem => ({ kind: "image", src });
const images = (n: number, prefix = "i"): ImageAssetItem[] =>
  Array.from({ length: n }, (_, i) => image(`/file:/${prefix}${i}.png?v=1`));

const IMAGE_BYTES = 1000 * 1000 * 4;

describe("AssetCache", () => {
  it("holds background loads to the slots left after the express lane", async () => {
    const { cache, inFlight, finish } = makeCache();
    cache.prefetch(images(8), 2);
    const background = DEFAULT_MAX_CONCURRENT - DEFAULT_EXPRESS_SLOTS;
    expect(inFlight().length).toBe(background);
    await finish("/file:/i0.png?v=1");
    expect(inFlight().length).toBe(background);
    expect(cache.isResident("/file:/i0.png?v=1")).toBe(true);
  });

  it("starts every gate load at once while background loads fill their slots", async () => {
    const { cache, inFlight } = makeCache();
    cache.prefetch(images(8), 2);
    // Background loads never take the express slots.
    expect(inFlight().length).toBe(DEFAULT_MAX_CONCURRENT - DEFAULT_EXPRESS_SLOTS);
    void cache.request(images(3, "gate"), 0, "beat:1");
    // A gate never waits for a slot, so all three run alongside the four
    // background loads already in flight.
    expect(inFlight().length).toBe(DEFAULT_MAX_CONCURRENT - DEFAULT_EXPRESS_SLOTS + 3);
    const gates = inFlight().filter((i) => i.src.includes("gate"));
    expect(gates.length).toBe(3);
  });

  it("starts a queued gate load before queued background work when a gate slot frees", async () => {
    const { cache, inFlight, finish } = makeCache();
    cache.prefetch(images(10), 3);
    // Seven gate loads: six run at once, the seventh waits for a gate slot,
    // never for a background one.
    void cache.request(images(7, "gate"), 0, "beat:1");
    expect(inFlight().filter((i) => i.src.includes("gate")).length).toBe(
      DEFAULT_MAX_CONCURRENT,
    );
    expect(inFlight().some((i) => i.src === "/file:/gate6.png?v=1")).toBe(false);
    await finish("/file:/gate0.png?v=1");
    // The freed gate slot went to the waiting gate load; and a freed
    // background slot goes nowhere while the gate is pending.
    expect(inFlight().some((i) => i.src === "/file:/gate6.png?v=1")).toBe(true);
    await finish("/file:/i0.png?v=1");
    expect(inFlight().some((i) => i.src === "/file:/i4.png?v=1")).toBe(false);
  });

  it("moves a queued item up when it is asked for sooner", async () => {
    const { cache, inFlight } = makeCache();
    cache.prefetch(images(6), 3);
    expect(inFlight().some((i) => i.src === "/file:/i5.png?v=1")).toBe(false);
    void cache.request([image("/file:/i5.png?v=1")], 0, "beat:1");
    expect(inFlight().some((i) => i.src === "/file:/i5.png?v=1")).toBe(true);
  });

  it("settles a request with what loaded, what failed, and what stayed pinned", async () => {
    const { cache, finish, fail } = makeCache();
    const pending = cache.request(
      [image("/file:/a.png?v=1"), image("/file:/b.png?v=1")],
      1,
      "load:A",
    );
    await finish("/file:/a.png?v=1");
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      await fail("/file:/b.png?v=1");
    }
    const result = await pending;
    expect(result).toEqual({
      loaded: ["/file:/a.png?v=1"],
      failed: ["/file:/b.png?v=1"],
      pinned: ["/file:/a.png?v=1"],
    });
    expect(cache.pinsOf("/file:/a.png?v=1")).toEqual(["load:A"]);
    expect(cache.stateOf("/file:/b.png?v=1")).toBe("failed");
  });

  it("gives up on an item after its attempts, and tries again once the file changes", async () => {
    const { cache, created, fail } = makeCache();
    const first = cache.request([image("/file:/b.png?v=1")], 0, "beat:1");
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      await fail("/file:/b.png?v=1");
    }
    expect((await first).failed).toEqual(["/file:/b.png?v=1"]);
    expect(created.length).toBe(MAX_LOAD_ATTEMPTS);
    // Still blacklisted: answered at once, nothing new requested.
    const again = await cache.request([image("/file:/b.png?v=1")], 0, "beat:2");
    expect(again.failed).toEqual(["/file:/b.png?v=1"]);
    expect(created.length).toBe(MAX_LOAD_ATTEMPTS);
    cache.evictFile("/file:/b.png?v=2");
    void cache.request([image("/file:/b.png?v=1")], 0, "beat:3");
    expect(created.length).toBe(MAX_LOAD_ATTEMPTS + 1);
  });

  it("gives a failed item a fresh set of attempts once the cool-down has passed", async () => {
    let clock = 1000;
    const created: FakeImage[] = [];
    const cache = new AssetCache({
      createImage: () => {
        const img = new FakeImage();
        created.push(img);
        return img;
      },
      now: () => clock,
    });
    const src = "/file:/b.png?v=1";
    const first = cache.request([image(src)], 0, "beat:1");
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      created.find((c) => !c.done)!.fail();
      await settle();
    }
    expect((await first).failed).toEqual([src]);
    // Too soon: still failed, nothing requested.
    clock += FAILED_RETRY_COOLDOWN_MS - 1;
    expect((await cache.request([image(src)], 0, "beat:2")).failed).toEqual([src]);
    expect(created.length).toBe(MAX_LOAD_ATTEMPTS);
    // After the cool-down the next gate tries again, and this time it loads.
    clock += 1;
    const again = cache.request([image(src)], 0, "beat:3");
    expect(created.length).toBe(MAX_LOAD_ATTEMPTS + 1);
    created[created.length - 1]!.finishLoad();
    await settle();
    expect((await again).loaded).toEqual([src]);
    expect(cache.isResident(src)).toBe(true);
  });

  it("forgets every entry of a file when it changes, and ignores a stale load that finishes late", async () => {
    const { cache, created, finish } = makeCache();
    void cache.request(
      [image("/file:/a.svg?v=1"), image("/file:/a.svg?v=1&filters=x")],
      0,
      "beat:1",
    );
    await finish("/file:/a.svg?v=1");
    cache.prefetch([image("/file:/a.svg?v=1&filters=y")], 3);
    expect(cache.has("/file:/a.svg?v=1")).toBe(true);
    expect(cache.has("/file:/a.svg?v=1&filters=y")).toBe(true);
    // The prefetch waits behind the gate still in flight, so it is queued,
    // not loading, when the file changes.
    expect(created.some((i) => i.src === "/file:/a.svg?v=1&filters=y")).toBe(false);
    cache.evictFile("/file:/a.svg?v=2");
    expect(cache.has("/file:/a.svg?v=1")).toBe(false);
    expect(cache.has("/file:/a.svg?v=1&filters=x")).toBe(false);
    expect(cache.has("/file:/a.svg?v=1&filters=y")).toBe(false);
    // The variant that was mid-load finishes now; nobody is home. The queued
    // one left the queue and never starts.
    created.find((i) => i.src === "/file:/a.svg?v=1&filters=x" && !i.done)!.finishLoad();
    await settle();
    expect(cache.has("/file:/a.svg?v=1&filters=x")).toBe(false);
    expect(cache.has("/file:/a.svg?v=1&filters=y")).toBe(false);
    expect(created.some((i) => i.src === "/file:/a.svg?v=1&filters=y")).toBe(false);
    expect(cache.inFlightCount).toBe(0);
  });

  it("does not hold a data: src", async () => {
    const { cache, created } = makeCache();
    const result = await cache.request([image("data:image/png;base64,AAAA")], 0, "beat:1");
    expect(result).toEqual({ loaded: [], failed: [], pinned: [] });
    expect(created.length).toBe(0);
  });

  it("counts a duplicated item once", async () => {
    const { cache, created, finish } = makeCache();
    const pending = cache.request(
      [image("/file:/a.png?v=1"), image("/file:/a.png?v=1")],
      0,
      "beat:1",
    );
    expect(created.length).toBe(1);
    await finish("/file:/a.png?v=1");
    expect((await pending).loaded).toEqual(["/file:/a.png?v=1"]);
  });

  it("release without drop only unpins; with drop it evicts what is left unpinned, sparing other pins and what the page displays", async () => {
    const { cache, finish } = makeCache();
    const a = image("/file:/a.png?v=1");
    const b = image("/file:/b.png?v=1");
    const c = image("/file:/c.png?v=1");
    void cache.request([a, b, c], 1, "load:A");
    void cache.request([b], 0, "beat:1");
    for (const src of [a.src, b.src, c.src]) {
      await finish(src);
    }
    cache.setDerivedPins(() => [c.src]);
    cache.release(["load:A"], true);
    expect(cache.has(a.src)).toBe(false);
    expect(cache.has(b.src)).toBe(true);
    expect(cache.has(c.src)).toBe(true);
    cache.release(["beat:1"], false);
    expect(cache.isResident(b.src)).toBe(true);
    expect(cache.pinsOf(b.src)).toEqual([]);
  });

  it("cancels a queued item that a drop leaves unpinned", async () => {
    const { cache, inFlight } = makeCache({ maxConcurrent: 1, expressSlots: 0 });
    const pending = cache.request(
      [image("/file:/a.png?v=1"), image("/file:/b.png?v=1")],
      0,
      "beat:1",
    );
    expect(inFlight().map((i) => i.src)).toEqual(["/file:/a.png?v=1"]);
    cache.release(["beat:1"], true);
    expect(cache.has("/file:/b.png?v=1")).toBe(false);
    // The in-flight one is dropped too: whatever arrives belongs to nobody.
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
    inFlight()[0]!.finishLoad();
    await settle();
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
    const result = await pending;
    expect(result.failed).toEqual(["/file:/a.png?v=1", "/file:/b.png?v=1"]);
    expect(cache.queuedCount).toBe(0);
  });

  it("evicts the least recently used of the prediction pool over predict_cache_size, sparing pinned, displayed, and this round's", async () => {
    const { cache, finish } = makeCache({ predictBytes: IMAGE_BYTES * 2 + 1 });
    cache.prefetch([image("/file:/a.png?v=1")], 2);
    await finish("/file:/a.png?v=1");
    cache.prefetch([image("/file:/b.png?v=1")], 2);
    await finish("/file:/b.png?v=1");
    cache.prefetch([image("/file:/c.png?v=1")], 2);
    await finish("/file:/c.png?v=1");
    // Three do not fit: the oldest went.
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
    expect(cache.has("/file:/b.png?v=1")).toBe(true);
    expect(cache.has("/file:/c.png?v=1")).toBe(true);
    // A pinned newcomer is outside the pool: nothing has to go to make room.
    void cache.request([image("/file:/d.png?v=1")], 0, "beat:1");
    await finish("/file:/d.png?v=1");
    expect(cache.has("/file:/b.png?v=1")).toBe(true);
    expect(cache.has("/file:/c.png?v=1")).toBe(true);
    expect(cache.has("/file:/d.png?v=1")).toBe(true);
    // What the page displays is outside the pool too, even when it is the
    // oldest: the next overflow takes c, not b.
    cache.setDerivedPins(() => ["/file:/b.png?v=1"]);
    cache.prefetch([image("/file:/e.png?v=1")], 2);
    await finish("/file:/e.png?v=1");
    expect(cache.has("/file:/c.png?v=1")).toBe(true);
    cache.prefetch([image("/file:/f.png?v=1")], 2);
    await finish("/file:/f.png?v=1");
    expect(cache.has("/file:/b.png?v=1")).toBe(true);
    expect(cache.has("/file:/c.png?v=1")).toBe(false);
    expect(cache.has("/file:/e.png?v=1")).toBe(true);
    expect(cache.has("/file:/f.png?v=1")).toBe(true);
    expect(cache.bytes).toBeGreaterThan(cache.predictBytes);
  });

  it("keeps pinned bytes out of the prediction pool", async () => {
    const { cache, finish } = makeCache({ predictBytes: IMAGE_BYTES * 2 + 1 });
    const loaded = images(3, "a");
    const pending = cache.request(loaded, 1, "load:A");
    for (const item of loaded) {
      await finish(item.src);
    }
    await pending;
    // Three pinned images exceed the pool on their own; prediction still
    // keeps two of its own.
    const predicted = images(2, "p");
    for (const item of predicted) {
      cache.prefetch([item], 2);
      await finish(item.src);
    }
    expect(cache.residentCount).toBe(5);
    cache.prefetch([image("/file:/q.png?v=1")], 2);
    await finish("/file:/q.png?v=1");
    expect(cache.has(predicted[0]!.src)).toBe(false);
    expect(cache.residentCount).toBe(5);
  });

  it("caps what the load pins hold between them at load_cache_size, and never a gate", async () => {
    const { cache, finish } = makeCache({ loadBytes: IMAGE_BYTES * 2 });
    const a = images(2, "a");
    const pendingA = cache.request(a, 1, "load:A");
    for (const item of a) {
      await finish(item.src);
    }
    expect((await pendingA).pinned).toEqual(a.map((i) => i.src));
    // The cap is spent: a second scene keeps nothing pinned, resident still.
    const b = images(2, "b");
    const pendingB = cache.request(b, 1, "load:B");
    for (const item of b) {
      await finish(item.src);
    }
    expect((await pendingB).pinned).toEqual([]);
    expect(cache.isResident(b[1]!.src)).toBe(true);
    // A gate pins what it needs regardless.
    const gate = images(1, "g");
    const pendingGate = cache.request(gate, 0, "beat:1");
    await finish(gate[0]!.src);
    expect((await pendingGate).pinned).toEqual([gate[0]!.src]);
    // Releasing A hands the cap to the next load.
    cache.release(["load:A"], false);
    const c = images(1, "c");
    const pendingC = cache.request(c, 1, "load:C");
    await finish(c[0]!.src);
    expect((await pendingC).pinned).toEqual([c[0]!.src]);
  });

  it("never evicts with a prediction pool of 0", async () => {
    const { cache, finish } = makeCache({ predictBytes: 0 });
    for (const item of images(4)) {
      cache.prefetch([item], 2);
      await finish(item.src);
    }
    expect(cache.residentCount).toBe(4);
  });

  it("pins in order until the pin budget, leaving the rest resident but unpinned", async () => {
    const { cache, finish } = makeCache();
    const items = images(3);
    const pending = cache.request(items, 1, "load:A", IMAGE_BYTES * 2);
    for (const item of items) {
      await finish(item.src);
    }
    const result = await pending;
    expect(result.loaded).toEqual(items.map((i) => i.src));
    expect(result.pinned).toEqual([items[0]!.src, items[1]!.src]);
    expect(cache.isResident(items[2]!.src)).toBe(true);
    expect(cache.pinsOf(items[2]!.src)).toEqual([]);
  });

  it("reports progress per pin as items settle", async () => {
    const { cache, finish, fail } = makeCache();
    const seen: AssetsProgressParams[] = [];
    cache.onProgress((p) => seen.push(p));
    const items = images(2);
    const pending = cache.request(items, 0, "restore");
    await finish(items[0]!.src);
    expect(seen.at(-1)).toEqual({ pin: "restore", loaded: 1, failed: 0, total: 2 });
    for (let i = 0; i < MAX_LOAD_ATTEMPTS; i++) {
      await fail(items[1]!.src);
    }
    await pending;
    expect(seen.at(-1)).toEqual({ pin: "restore", loaded: 1, failed: 1, total: 2 });
  });

  it("decodes audio through the injected decoder and sizes it exactly", async () => {
    const { cache } = makeCache();
    cache.setAudioDecoder(async () =>
      ({ length: 1000, numberOfChannels: 2 }) as unknown as AudioBuffer,
    );
    const params = { channel: "music", key: "audio.theme", src: "/file:/theme.mp3?v=1" };
    const result = await cache.request([{ kind: "audio", params }], 0, "beat:1");
    expect(result.loaded).toEqual(["audio.theme"]);
    expect(cache.getAudio("audio.theme")).toBeDefined();
    expect(cache.bytes).toBe(1000 * 2 * 4);
    // Changing the file drops the audio that plays it, too.
    cache.evictFile("/file:/theme.mp3?v=2");
    expect(cache.has("audio.theme")).toBe(false);
  });

  it("fails audio the decoder cannot decode", async () => {
    const { cache } = makeCache();
    let decodes = 0;
    cache.setAudioDecoder(async () => {
      decodes++;
      return null;
    });
    const params = { channel: "music", key: "audio.bad", src: "/file:/bad.mp3?v=1" };
    const result = await cache.request([{ kind: "audio", params }], 0, "beat:1");
    expect(result.failed).toEqual(["audio.bad"]);
    expect(decodes).toBe(MAX_LOAD_ATTEMPTS);
  });

  it("makes fonts and video resident holding nothing when the platform has no fonts or fetch", async () => {
    const { cache } = makeCache();
    const result = await cache.request(
      [
        { kind: "font", src: "/file:/Fancy.ttf?v=1", family: "Fancy" },
        { kind: "video", src: "/file:/clip.mp4?v=1" },
      ],
      1,
      "load:A",
    );
    expect(result.loaded).toEqual([
      "font:Fancy|||||/file:/Fancy.ttf?v=1",
      "/file:/clip.mp4?v=1",
    ]);
    expect(cache.bytes).toBe(0);
  });

  it("adds a font face to the platform and removes it when the entry goes", async () => {
    const added: string[] = [];
    const deleted: string[] = [];
    const cache = new AssetCache({
      createImage: () => new FakeImage(),
      fetchBytes: async () => ({ bytes: new ArrayBuffer(3000), type: "font/ttf" }),
      createFontFace: (family) => ({ family, load: async () => undefined }),
      fonts: {
        add: (face) => added.push(face.family),
        delete: (face) => deleted.push(face.family),
      },
    });
    const result = await cache.request(
      [{ kind: "font", src: "/file:/Fancy.ttf?v=1", family: "Fancy", weight: "bold" }],
      0,
      "layout:hud",
    );
    expect(result.loaded).toEqual(["font:Fancy|bold||||/file:/Fancy.ttf?v=1"]);
    expect(added).toEqual(["Fancy"]);
    expect(cache.bytes).toBe(3000);
    cache.release(["layout:hud"], true);
    expect(deleted).toEqual(["Fancy"]);
  });

  it("holds video as an object url and revokes it on eviction", async () => {
    const revoked: string[] = [];
    const cache = new AssetCache({
      createImage: () => new FakeImage(),
      fetchBytes: async () => ({ bytes: new ArrayBuffer(5000), type: "video/mp4" }),
      createObjectURL: () => "blob:clip",
      revokeObjectURL: (url) => revoked.push(url),
    });
    await cache.request([{ kind: "video", src: "/file:/clip.mp4?v=1" }], 1, "load:A");
    expect(cache.getVideoUrl("/file:/clip.mp4?v=1")).toBe("blob:clip");
    expect(cache.bytes).toBe(5000);
    cache.release(["load:A"], true);
    expect(revoked).toEqual(["blob:clip"]);
  });

  it("counts an image resident when its decode never settles", async () => {
    const created: FakeImage[] = [];
    const cache = new AssetCache(
      {
        createImage: () => {
          const img = new FakeImage();
          img.decode = () => new Promise<void>(() => {});
          created.push(img);
          return img;
        },
      },
      { decodeTimeoutMs: 5 },
    );
    const pending = cache.request([image("/file:/a.png?v=1")], 0, "beat:1");
    // The load fires; the decode is stuck for ever.
    created[0]!.finishLoad();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const result = await pending;
    expect(result.loaded).toEqual(["/file:/a.png?v=1"]);
    expect(cache.isResident("/file:/a.png?v=1")).toBe(true);
  });

  it("survives a target that loads synchronously", async () => {
    let created = 0;
    const cache = new AssetCache({
      createImage: () => {
        created++;
        const img = new FakeImage();
        Object.defineProperty(img, "src", {
          get: () => "",
          set: () => queueMicrotask(() => img.finishLoad()),
        });
        return img;
      },
    });
    const result = await cache.request(images(3), 0, "beat:1");
    expect(result.loaded.length).toBe(3);
    expect(created).toBe(3);
    expect(cache.inFlightCount).toBe(0);
  });

  it("releases the slot when creating a target throws", async () => {
    const cache = new AssetCache({
      createImage: () => {
        throw new Error("no images here");
      },
    });
    const result = await cache.request([image("/file:/a.png?v=1")], 0, "beat:1");
    expect(result.failed).toEqual(["/file:/a.png?v=1"]);
    expect(cache.inFlightCount).toBe(0);
  });

  it("clamps a nonsense concurrency cap instead of stalling for ever", async () => {
    const { cache, inFlight } = makeCache({ maxConcurrent: 0 });
    cache.prefetch(images(2), 0);
    expect(inFlight().length).toBe(1);
  });

  it("reports what it holds", async () => {
    const { cache, finish } = makeCache({
      predictBytes: 10 * IMAGE_BYTES,
      loadBytes: 5 * IMAGE_BYTES,
    });
    void cache.request([image("/file:/a.png?v=1")], 1, "load:A");
    cache.prefetch([image("/file:/b.png?v=1")], 2);
    await finish("/file:/a.png?v=1");
    const stats = cache.stats();
    expect(stats.resident).toBe(1);
    expect(stats.loading).toBe(1);
    expect(stats.bytes.image).toBe(IMAGE_BYTES);
    expect(stats.bytes.total).toBe(IMAGE_BYTES);
    expect(stats.pins).toEqual(["load:A"]);
    expect(stats.pinnedBytes).toBe(IMAGE_BYTES);
    expect(stats.predictBytes).toBe(10 * IMAGE_BYTES);
    expect(stats.loadBytes).toBe(5 * IMAGE_BYTES);
  });
});
