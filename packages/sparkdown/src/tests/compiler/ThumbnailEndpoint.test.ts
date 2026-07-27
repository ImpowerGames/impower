// Coverage for the thumbnail endpoint the editor's service worker serves
// (`?thumb=<width>`) and the base64 encoding both hosts rely on.
//
// This logic used to live inside sw.ts, where nothing could reach it — a
// service worker module can't be imported under vitest without executing its
// event registrations. Cache Storage is a parameter here precisely so the
// decisions around it are testable; the SW is now a thin adapter that supplies
// the real cache.

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bytesToBase64,
  getOrCreateThumbnail,
  THUMB_MIN_WIDTH,
  type ThumbnailCache,
  type ThumbnailFile,
} from "../../thumbnails/composeThumbnail";

/** Minimal in-memory stand-in for Cache Storage, with call counts. */
const makeCache = () => {
  const entries = new Map<string, Response>();
  const calls = { match: 0, put: 0 };
  const cache: ThumbnailCache = {
    async match(key) {
      calls.match++;
      const hit = entries.get(key);
      return hit ? hit.clone() : undefined;
    },
    async put(key, response) {
      calls.put++;
      entries.set(key, response);
    },
  };
  return { cache, entries, calls };
};

const makeFile = (
  bytes = 64,
  lastModified = 1000,
): ThumbnailFile =>
  Object.assign(new Blob([new Uint8Array(bytes)], { type: "image/png" }), {
    lastModified,
  }) as ThumbnailFile;

let rasterizeCalls = 0;

const stubRasterizer = () => {
  rasterizeCalls = 0;
  vi.stubGlobal("createImageBitmap", async () => {
    rasterizeCalls++;
    return { width: 100, height: 50, close() {} };
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return { drawImage() {} };
      }
      async convertToBlob() {
        return new Blob([new Uint8Array(16)], { type: "image/webp" });
      }
    },
  );
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("bytesToBase64", () => {
  it("round-trips", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(atob(bytesToBase64(bytes))).toBe(
      String.fromCharCode(...Array.from(bytes)),
    );
  });

  it("handles buffers far past the argument limit", () => {
    // Deliberately past where an unchunked `String.fromCharCode(...bytes)`
    // starts throwing RangeError — measured at somewhere between 100k and 130k
    // elements on this runtime, so a chunk-sized buffer would NOT catch a
    // regression here. Real assets are this big, which is the whole point.
    const bytes = new Uint8Array(400_000);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = i % 256;
    }
    const decoded = atob(bytesToBase64(bytes));
    expect(decoded.length).toBe(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(bytes.length - 1)).toBe(
      (bytes.length - 1) % 256,
    );
  });
});

describe("thumbnail endpoint", () => {
  it("generates, caches, and serves webp", async () => {
    stubRasterizer();
    const { cache, calls } = makeCache();
    const res = await getOrCreateThumbnail(cache, "/a/x.png", makeFile(), "144");
    expect(res?.status).toBe(200);
    expect(res?.headers.get("Content-Type")).toBe("image/webp");
    expect(res?.headers.get("Cache-Control")).toContain("immutable");
    expect(calls.put).toBe(1);
  });

  it("serves the cached copy instead of regenerating", async () => {
    stubRasterizer();
    const { cache, calls } = makeCache();
    const file = makeFile();
    await getOrCreateThumbnail(cache, "/a/x.png", file, "144");
    const afterFirst = rasterizeCalls;
    const res = await getOrCreateThumbnail(cache, "/a/x.png", file, "144");
    expect(res?.status).toBe(200);
    expect(rasterizeCalls).toBe(afterFirst);
    expect(calls.put).toBe(1);
  });

  it("regenerates when the file's bytes change, not when its url is re-stamped", async () => {
    stubRasterizer();
    const { cache } = makeCache();
    await getOrCreateThumbnail(cache, "/a/x.png", makeFile(64, 1000), "144");
    const afterFirst = rasterizeCalls;
    // Same signature — a re-stamped `?v=` must NOT cause a regeneration.
    await getOrCreateThumbnail(cache, "/a/x.png", makeFile(64, 1000), "144");
    expect(rasterizeCalls).toBe(afterFirst);
    // Edited file — different mtime, so it must regenerate.
    await getOrCreateThumbnail(cache, "/a/x.png", makeFile(64, 2000), "144");
    expect(rasterizeCalls).toBe(afterFirst + 1);
  });

  it("keys separately per requested width", async () => {
    stubRasterizer();
    const { cache, entries } = makeCache();
    const file = makeFile();
    await getOrCreateThumbnail(cache, "/a/x.png", file, "144");
    await getOrCreateThumbnail(cache, "/a/x.png", file, "360");
    expect(entries.size).toBe(2);
  });

  it("declines a garbage or absurd width rather than guessing", async () => {
    stubRasterizer();
    const { cache } = makeCache();
    const file = makeFile();
    expect(
      await getOrCreateThumbnail(cache, "/a/x.png", file, "garbage"),
    ).toBeUndefined();
    expect(await getOrCreateThumbnail(cache, "/a/x.png", file, "0")).toBeUndefined();
    expect(
      await getOrCreateThumbnail(cache, "/a/x.png", file, String(THUMB_MIN_WIDTH - 1)),
    ).toBeUndefined();
    expect(rasterizeCalls).toBe(0);
  });

  it("returns undefined so the caller can serve the original when generation fails", async () => {
    // No rasterizer in this host.
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("createImageBitmap", undefined);
    const { cache, calls } = makeCache();
    const res = await getOrCreateThumbnail(
      cache,
      "/a/x.png",
      makeFile(),
      "144",
    );
    expect(res).toBeUndefined();
    // Nothing cached, so a later request in a capable host still works.
    expect(calls.put).toBe(0);
  });

  it("survives a cache that throws", async () => {
    stubRasterizer();
    const cache: ThumbnailCache = {
      async match() {
        throw new Error("cache unavailable");
      },
      async put() {},
    };
    // A broken cache must degrade to "serve the original", not reject.
    await expect(
      getOrCreateThumbnail(cache, "/a/x.png", makeFile(), "144"),
    ).resolves.toBeUndefined();
  });
});
