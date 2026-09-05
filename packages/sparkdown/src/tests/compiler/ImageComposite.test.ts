// Coverage for the compositing itself (#292) — the parts previously verified
// only by hand in a running editor.
//
// `composeThumbnailBlob` needs OffscreenCanvas/createImageBitmap, which node
// doesn't have, so those are stubbed. That is deliberate: the point of these
// tests is the surrounding decision-making — draw order, the fetch/bridge
// fallback, failure caching, and the byte cap — not the browser's rasterizer.

import { afterEach, describe, expect, it, vi } from "vitest";
import { getImageCompositeSrc } from "../../compiler/utils/getImageComposite";
import {
  clampThumbnailWidth,
  thumbnailCacheKey,
  THUMB_MAX_WIDTH,
  THUMB_MIN_WIDTH,
} from "../../thumbnails/composeThumbnail";

/**
 * Build a context whose layered image stacks the given layer names.
 * `salt` keeps each test's srcs unique — the composite cache is module-level
 * and would otherwise leak results between tests.
 */
const makeContext = (salt: string, layerNames: string[]) => {
  const image: Record<string, any> = {};
  for (const name of layerNames) {
    image[name] = {
      $type: "image",
      $name: name,
      src: `/file:/local/${salt}/${name}.png?v=1`,
      uri: `file://proj/${salt}/${name}.png`,
    };
  }
  return {
    image,
    layered_image: {
      bg: {
        $type: "layered_image",
        $name: "bg",
        assets: layerNames.map((name) => ({ $type: "", $name: name })),
      },
    },
  };
};

/** Records which bitmaps got drawn, in order, so draw order is assertable. */
let drawn: string[] = [];

const stubRasterizer = (blobBytes = 32) => {
  drawn = [];
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    const tag = await blob.text();
    return { width: 100, height: 50, close() {}, tag };
  });
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      constructor(
        public width: number,
        public height: number,
      ) {}
      getContext() {
        return {
          drawImage: (bitmap: any) => drawn.push(bitmap.tag),
        };
      }
      async convertToBlob() {
        return new Blob([new Uint8Array(blobBytes)], { type: "image/webp" });
      }
    },
  );
};

/** fetch that serves each layer's own name as its body, so draws are traceable. */
const stubFetch = (opts: { fails?: boolean } = {}) => {
  const calls: string[] = [];
  vi.stubGlobal("fetch", async (url: string) => {
    calls.push(url);
    if (opts.fails) {
      throw new TypeError("fetch not supported for this scheme");
    }
    const name = url.split("/").pop()!.split(".")[0]!;
    return {
      ok: true,
      blob: async () => new Blob([name]),
      headers: { get: () => null },
    };
  });
  return calls;
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("thumbnail cache key", () => {
  it("changes when a layer's bytes change, not when its url is re-stamped", () => {
    const a = [{ path: "/x/a.png", lastModified: 10, size: 100 }];
    const b = [{ path: "/x/a.png", lastModified: 20, size: 100 }];
    const c = [{ path: "/x/a.png", lastModified: 10, size: 999 }];
    expect(thumbnailCacheKey(a, 360)).toBe(thumbnailCacheKey([...a], 360));
    expect(thumbnailCacheKey(a, 360)).not.toBe(thumbnailCacheKey(b, 360));
    expect(thumbnailCacheKey(a, 360)).not.toBe(thumbnailCacheKey(c, 360));
  });

  it("distinguishes layer sets and widths", () => {
    const one = [{ path: "/x/a.png", lastModified: 1, size: 2 }];
    const two = [...one, { path: "/x/b.png", lastModified: 3, size: 4 }];
    expect(thumbnailCacheKey(one, 360)).not.toBe(thumbnailCacheKey(two, 360));
    expect(thumbnailCacheKey(one, 360)).not.toBe(thumbnailCacheKey(one, 144));
  });

  it("clamps requested widths into range", () => {
    expect(clampThumbnailWidth(1)).toBe(THUMB_MIN_WIDTH);
    expect(clampThumbnailWidth(99999)).toBe(THUMB_MAX_WIDTH);
    expect(clampThumbnailWidth("garbage")).toBe(THUMB_MIN_WIDTH);
    expect(clampThumbnailWidth(144)).toBe(144);
  });
});

describe("getImageCompositeSrc", () => {
  it("draws layers bottom-first, matching the order the game paints", async () => {
    stubRasterizer();
    stubFetch();
    const ctx = makeContext("order", ["base", "prop", "light"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toMatch(/^data:image\/webp;base64,/);
    // Reversing this would silently invert every layered image.
    expect(drawn).toEqual(["base", "prop", "light"]);
  });

  it("does not composite a single-layer asset the host can load as it is", async () => {
    stubRasterizer();
    const calls = stubFetch();
    const ctx = makeContext("single", ["only"]);
    const src = await getImageCompositeSrc(ctx, ctx.image["only"]);
    expect(src).toBeUndefined();
    // Nothing to flatten, so nothing should have been fetched or drawn.
    expect(calls).toEqual([]);
    expect(drawn).toEqual([]);
  });

  // #440: in VS Code a single raster image's src is a workspace uri, which the
  // markdown sanitizer strips off the element — leaving an image with nothing
  // to load. It has to be inlined as `data:` the way a composite already is.
  it("inlines a single image whose src the host cannot load", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("workspaceuri", ["lone"]);
    ctx.image["lone"]!.src = "file://proj/workspaceuri/lone.png";
    const asked: string[] = [];
    const src = await getImageCompositeSrc(ctx, ctx.image["lone"], {
      readFileBytes: async (uri) => {
        asked.push(uri);
        return btoa("lone");
      },
    });
    expect(src).toMatch(/^data:image\/webp;base64,/);
    expect(asked).toEqual(["file://proj/workspaceuri/lone.png"]);
    expect(drawn).toEqual(["lone"]);
  });

  it.each([
    ["served-url", "https://cdn.example/pic.png"],
    ["inlined-data-uri", "data:image/svg+xml,%3Csvg%2F%3E"],
    ["page-relative-path", "/file:/local/assets/pic.png?v=1-2"],
  ])("leaves a single image on a %s alone", async (label, srcValue) => {
    stubRasterizer();
    const calls = stubFetch();
    const ctx = makeContext(label, ["lone"]);
    ctx.image["lone"]!.src = srcValue;
    const src = await getImageCompositeSrc(ctx, ctx.image["lone"], {
      readFileBytes: async () => btoa("lone"),
    });
    // Re-encoding a source the host already renders costs work and sharpness.
    expect(src).toBeUndefined();
    expect(calls).toEqual([]);
    expect(drawn).toEqual([]);
  });

  it("degrades to the plain src when a lone workspace uri has no bridge", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("nobridge", ["lone"]);
    ctx.image["lone"]!.src = "file://proj/nobridge/lone.png";
    const src = await getImageCompositeSrc(ctx, ctx.image["lone"]);
    expect(src).toBeUndefined();
  });

  it("falls back to the byte bridge when a layer can't be fetched", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("bridge", ["base", "prop"]);
    const asked: string[] = [];
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg, {
      readFileBytes: async (uri) => {
        asked.push(uri);
        // base64 of the layer name, so draw order stays traceable.
        return btoa(uri.split("/").pop()!.split(".")[0]!);
      },
    });
    expect(src).toMatch(/^data:image\/webp;base64,/);
    // Asked by URI, not src — the bridge reads workspace files.
    expect(asked).toEqual([
      "file://proj/bridge/base.png",
      "file://proj/bridge/prop.png",
    ]);
    expect(drawn).toEqual(["base", "prop"]);
  });

  it("gives up when a layer is unreachable and no bridge is available", async () => {
    stubRasterizer();
    const calls = stubFetch({ fails: true });
    const ctx = makeContext("unreachable", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toBeUndefined();
    expect(calls.length).toBe(2);
  });

  it("caches the failure so a dead fetch isn't retried on every resolve", async () => {
    stubRasterizer();
    const calls = stubFetch({ fails: true });
    const ctx = makeContext("failcache", ["base", "prop"]);
    await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    const afterFirst = calls.length;
    await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    // Second call must be served from the cache, not re-fetched.
    expect(calls.length).toBe(afterFirst);
  });

  it("reuses the cached composite instead of recompositing", async () => {
    stubRasterizer();
    const calls = stubFetch();
    const ctx = makeContext("hit", ["base", "prop"]);
    const first = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    const afterFirst = calls.length;
    const second = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(second).toBe(first);
    expect(calls.length).toBe(afterFirst);
  });

  it("falls back rather than emitting an oversized data uri", async () => {
    // Over the 512KB ceiling — a host might truncate it into a broken image.
    stubRasterizer(600 * 1024);
    stubFetch();
    const ctx = makeContext("toobig", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toBeUndefined();
  });

  it("evicts old entries rather than growing without bound", async () => {
    stubRasterizer();
    const calls = stubFetch();
    // Well past the 64-entry ceiling: each composite stores two entries (a
    // provisional src key and the stable signature key).
    const contexts = Array.from({ length: 60 }, (_, i) =>
      makeContext(`evict${i}`, ["base", "prop"]),
    );
    for (const ctx of contexts) {
      await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    }
    const before = calls.length;
    // The first one is long since evicted, so this must go back to the network.
    await getImageCompositeSrc(contexts[0]!, contexts[0]!.layered_image.bg);
    expect(calls.length).toBeGreaterThan(before);
  });

  it("keeps recently READ entries, evicting by use rather than by insertion", async () => {
    // The distinction between an LRU and a plain FIFO: without the recency
    // refresh on read, the entry below would be evicted despite being the most
    // recently used, and a preview the user keeps returning to would
    // recomposite every time.
    stubRasterizer();
    const calls = stubFetch();
    const hot = makeContext("hot", ["base", "prop"]);
    await getImageCompositeSrc(hot, hot.layered_image.bg);

    const filler = Array.from({ length: 30 }, (_, i) =>
      makeContext(`filler${i}`, ["base", "prop"]),
    );
    for (const ctx of filler) {
      await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    }

    // Touch it, making it the most recently used entry.
    const beforeTouch = calls.length;
    await getImageCompositeSrc(hot, hot.layered_image.bg);
    expect(calls.length).toBe(beforeTouch);

    // Now overflow the cache. A FIFO would drop `hot` (inserted first).
    for (const ctx of Array.from({ length: 20 }, (_, i) =>
      makeContext(`after${i}`, ["base", "prop"]),
    )) {
      await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    }

    const beforeFinal = calls.length;
    await getImageCompositeSrc(hot, hot.layered_image.bg);
    expect(calls.length).toBe(beforeFinal);
    // ...while an untouched early entry did get evicted.
    await getImageCompositeSrc(filler[0]!, filler[0]!.layered_image.bg);
    expect(calls.length).toBeGreaterThan(beforeFinal);
  });

  it("degrades when the host cannot rasterize", async () => {
    // No OffscreenCanvas: an older host, or a worker without canvas support.
    stubFetch();
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("createImageBitmap", undefined);
    const ctx = makeContext("norender", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toBeUndefined();
  });
});
