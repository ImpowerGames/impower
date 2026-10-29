import { describe, expect, it } from "vitest";
import { type ImageAssetItem } from "../../../../spark-engine/src/game/modules/assets/types/AssetItem";
import { type AssetsProgressParams } from "../../../../spark-engine/src/game/modules/assets/types/AssetsProgressParams";
import { AssetCache } from "./AssetCache";

class FakeImage {
  src = "";
  naturalWidth = 1000;
  naturalHeight = 1000;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  done = false;
  finishLoad() {
    this.done = true;
    this.onload?.();
  }
  fail() {
    this.done = true;
    this.onerror?.();
  }
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const IMAGE_BYTES = 1000 * 1000 * 4;
const image = (src: string): ImageAssetItem => ({ kind: "image", src });

const makeCache = (options?: ConstructorParameters<typeof AssetCache>[1]) => {
  const created: FakeImage[] = [];
  let now = 0;
  const cache = new AssetCache(
    {
      createImage: () => {
        const img = new FakeImage();
        created.push(img);
        return img;
      },
      now: () => now,
    },
    { decodeTimeoutMs: 0, ...options },
  );
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
  return { cache, finish, fail, advance: (ms: number) => (now += ms) };
};

describe("AssetCache lifecycle", () => {
  it("reports an entry removed mid-request as failed, not loaded and pinned", async () => {
    const { cache, finish } = makeCache();
    const pending = cache.request(
      [image("/file:/a.png?v=1"), image("/file:/b.png?v=1")],
      1,
      "load:A",
    );
    await finish("/file:/a.png?v=1");
    cache.evictFile("/file:/a.png");
    await finish("/file:/b.png?v=1");
    const result = await pending;
    expect(result.loaded).toEqual(["/file:/b.png?v=1"]);
    expect(result.pinned).toEqual(["/file:/b.png?v=1"]);
    expect(result.failed).toEqual(["/file:/a.png?v=1"]);
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
  });

  it("drops an in-flight entry too, and reports it as not pinned", async () => {
    const { cache, finish } = makeCache();
    const pending = cache.request([image("/file:/a.png?v=1")], 1, "load:X");
    cache.release(["load:X"], true);
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
    await finish("/file:/a.png?v=1");
    expect(cache.has("/file:/a.png?v=1")).toBe(false);
    expect(cache.bytes).toBe(0);
    const result = await pending;
    expect(result.pinned).toEqual([]);
    expect(result.loaded).toEqual([]);
  });

  it("settles every waiting request when disposed", async () => {
    const { cache } = makeCache();
    const pending = cache.request([image("/file:/a.png?v=1")], 0, "beat:1");
    cache.dispose();
    const result = await pending;
    expect(result.loaded).toEqual([]);
    expect(result.failed).toEqual(["/file:/a.png?v=1"]);
  });

  it("reports progress for every request made under one pin", async () => {
    const { cache, finish } = makeCache();
    const seen: AssetsProgressParams[] = [];
    cache.onProgress((p) => seen.push(p));
    const first = cache.request(
      [image("/file:/a.png?v=1"), image("/file:/b.png?v=1")],
      1,
      "load:A",
    );
    const second = cache.request([image("/file:/c.png?v=1")], 1, "load:A");
    await finish("/file:/a.png?v=1");
    await finish("/file:/b.png?v=1");
    await finish("/file:/c.png?v=1");
    await Promise.all([first, second]);
    const last = seen.filter((p) => p.pin === "load:A").at(-1);
    expect(last).toEqual({ pin: "load:A", loaded: 3, failed: 0, total: 3 });
  });

  it("forgets failures when told to, so the next session tries again at once", async () => {
    const { cache, fail, finish } = makeCache();
    const first = cache.request([image("/file:/a.png?v=1")], 0, "beat:1");
    for (let i = 0; i < 3; i++) {
      await fail("/file:/a.png?v=1");
    }
    expect((await first).failed).toEqual(["/file:/a.png?v=1"]);
    expect((await cache.request([image("/file:/a.png?v=1")], 0, "beat:2")).failed).toEqual([
      "/file:/a.png?v=1",
    ]);
    cache.clearFailures();
    const retry = cache.request([image("/file:/a.png?v=1")], 0, "beat:3");
    expect(cache.stateOf("/file:/a.png?v=1")).toBe("loading");
    await finish("/file:/a.png?v=1");
    expect((await retry).loaded).toEqual(["/file:/a.png?v=1"]);
  });

  it("counts an asset two loaded scenes share once against the load cap", async () => {
    const { cache, finish } = makeCache({ loadBytes: IMAGE_BYTES * 2 });
    const shared = image("/file:/shared.png?v=1");
    const a = cache.request([shared], 1, "load:A");
    await finish(shared.src);
    expect((await a).pinned).toEqual([shared.src]);
    const portrait = image("/file:/portrait.png?v=1");
    const b = cache.request([shared, portrait], 1, "load:B");
    await finish(portrait.src);
    const result = await b;
    expect(result.pinned).toEqual([shared.src, portrait.src]);
    expect(cache.pinsOf(shared.src)).toEqual(["load:A", "load:B"]);
    cache.release(["load:A"], true);
    expect(cache.has(shared.src)).toBe(true);
  });
});
