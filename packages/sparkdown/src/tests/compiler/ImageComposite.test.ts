import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getImageCompositeSrc,
  getImagePreviewMarkupComposited,
} from "../../compiler/utils/getImageComposite";
import { IMAGE_PREVIEW_HEIGHT } from "../../compiler/utils/getImagePreviewSrc";
import {
  clampThumbnailWidth,
  COMPOSITE_MAX_EDGE,
  composeThumbnailBlob,
  thumbnailCacheKey,
  THUMB_MAX_WIDTH,
  THUMB_MIN_WIDTH,
} from "../../thumbnails/composeThumbnail";

const makeContext = (salt: string, layerNames: string[]) => {
  const image: Record<string, any> = {};
  for (const name of layerNames) {
    image[name] = {
      $type: "image",
      $name: name,
      version: 1,
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

describe("thumbnail sizing", () => {
  const stubAspectRasterizer = (srcW: number, srcH: number) => {
    const decoded: string[] = [];
    vi.stubGlobal("createImageBitmap", async (_blob: Blob, opts: any) => {
      const scale = opts?.resizeWidth
        ? opts.resizeWidth / srcW
        : opts?.resizeHeight
          ? opts.resizeHeight / srcH
          : 1;
      const width = Math.max(1, Math.round(srcW * scale));
      const height = Math.max(1, Math.round(srcH * scale));
      decoded.push(`${width}x${height}`);
      return { width, height, close() {} };
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {}
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(16)], { type: "image/webp" });
        }
      },
    );
    return decoded;
  };

  it("fits a wide source by width", async () => {
    const decoded = stubAspectRasterizer(4000, 3000);
    await composeThumbnailBlob(
      [{ path: "/a.png", blob: new Blob(["a"]), lastModified: 0, size: 1 }],
      360,
    );
    expect(decoded).toEqual(["360x270"]);
  });

  it("fits a very tall source by height, so nothing exceeds the box", async () => {
    const decoded = stubAspectRasterizer(200, 6000);
    await composeThumbnailBlob(
      [{ path: "/tall.png", blob: new Blob(["t"]), lastModified: 0, size: 1 }],
      360,
    );
    expect(decoded).toEqual(["360x10800", "12x360"]);
  });

  it("re-fits every layer together, so a composite stays aligned", async () => {
    const decoded = stubAspectRasterizer(200, 6000);
    await composeThumbnailBlob(
      [
        { path: "/a.png", blob: new Blob(["a"]), lastModified: 0, size: 1 },
        { path: "/b.png", blob: new Blob(["b"]), lastModified: 0, size: 1 },
      ],
      360,
    );
    expect(decoded).toEqual(["360x10800", "360x10800", "12x360", "12x360"]);
  });

  it("bounds the canvas when layers disagree wildly about aspect ratio", async () => {
    const drawnOn: string[] = [];
    let canvasSize = "";
    const sizes = [
      { w: 200, h: 6000 },
      { w: 6000, h: 200 },
    ];
    let call = 0;
    vi.stubGlobal("createImageBitmap", async (_blob: Blob, opts: any) => {
      const s = sizes[call % sizes.length]!;
      call++;
      const scale = opts.resizeWidth / s.w;
      const width = Math.max(1, Math.round(s.w * scale));
      const height = Math.max(1, Math.round(s.h * scale));
      drawnOn.push(`${width}x${height}`);
      return { width, height, close() {} };
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {
          canvasSize = `${width}x${height}`;
        }
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(16)], { type: "image/webp" });
        }
      },
    );

    await composeThumbnailBlob(
      [
        { path: "/tall.png", blob: new Blob(["t"]), lastModified: 0, size: 1 },
        { path: "/wide.png", blob: new Blob(["w"]), lastModified: 0, size: 1 },
      ],
      360,
    );

    const [w, h] = canvasSize.split("x").map(Number);
    expect(w).toBeLessThanOrEqual(360);
    expect(h).toBeLessThanOrEqual(360);
  });
});

describe("getImageCompositeSrc", () => {
  it("draws layers bottom-first, matching the order the game paints", async () => {
    stubRasterizer();
    stubFetch();
    const ctx = makeContext("order", ["base", "prop", "light"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toMatch(/^data:image\/webp;base64,/);
    expect(drawn).toEqual(["base", "prop", "light"]);
  });

  it("does not composite a single-layer asset the host can load as it is", async () => {
    stubRasterizer();
    const calls = stubFetch();
    const ctx = makeContext("single", ["only"]);
    const src = await getImageCompositeSrc(ctx, ctx.image["only"]);
    expect(src).toBeUndefined();
    expect(calls).toEqual([]);
    expect(drawn).toEqual([]);
  });

  it("inlines a single image whose src the host cannot load", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("workspaceuri", ["lone"]);
    ctx.image["lone"]!.src = "vscode-vfs://host/workspaceuri/lone.png";
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

  it("emits markup carrying the inlined image, not the workspace uri", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("markupinlined", ["lone"]);
    ctx.image["lone"]!.src = "vscode-vfs://host/markupinlined/lone.png";
    const markup = await getImagePreviewMarkupComposited(ctx, ctx.image["lone"], {
      readFileBytes: async () => btoa("lone"),
    });
    expect(markup).toMatch(/^<img src="data:image\/webp;base64,/);
    expect(markup).not.toContain("vscode-vfs://");
    expect(markup).toContain('alt="lone"');
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
  });

  it.each([
    ["served-url", "https://cdn.example/pic.png"],
    ["inlined-data-uri", "data:image/svg+xml,%3Csvg%2F%3E"],
    ["page-relative-path", "/file:/local/assets/pic.png?v=1-2"],
    ["desktop workspace uri", "file:///c:/workspace/images/pic.png"],
  ])("leaves a single image on a %s alone", async (label, srcValue) => {
    stubRasterizer();
    const calls = stubFetch();
    const ctx = makeContext(label, ["lone"]);
    ctx.image["lone"]!.src = srcValue;
    const src = await getImageCompositeSrc(ctx, ctx.image["lone"], {
      readFileBytes: async () => btoa("lone"),
    });
    expect(src).toBeUndefined();
    expect(calls).toEqual([]);
    expect(drawn).toEqual([]);
  });

  it("degrades to the plain src when a lone workspace uri has no bridge", async () => {
    stubRasterizer();
    stubFetch({ fails: true });
    const ctx = makeContext("nobridge", ["lone"]);
    ctx.image["lone"]!.src = "vscode-vfs://host/nobridge/lone.png";
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
        return btoa(uri.split("/").pop()!.split(".")[0]!);
      },
    });
    expect(src).toMatch(/^data:image\/webp;base64,/);
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
    stubRasterizer(600 * 1024);
    stubFetch();
    const ctx = makeContext("toobig", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toBeUndefined();
  });

  it("evicts old entries rather than growing without bound", async () => {
    stubRasterizer();
    const calls = stubFetch();
    const contexts = Array.from({ length: 60 }, (_, i) =>
      makeContext(`evict${i}`, ["base", "prop"]),
    );
    for (const ctx of contexts) {
      await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    }
    const before = calls.length;
    await getImageCompositeSrc(contexts[0]!, contexts[0]!.layered_image.bg);
    expect(calls.length).toBeGreaterThan(before);
  });

  it("keeps recently READ entries, evicting by use rather than by insertion", async () => {
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

    const beforeTouch = calls.length;
    await getImageCompositeSrc(hot, hot.layered_image.bg);
    expect(calls.length).toBe(beforeTouch);

    for (const ctx of Array.from({ length: 20 }, (_, i) =>
      makeContext(`after${i}`, ["base", "prop"]),
    )) {
      await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    }

    const beforeFinal = calls.length;
    await getImageCompositeSrc(hot, hot.layered_image.bg);
    expect(calls.length).toBe(beforeFinal);
    await getImageCompositeSrc(filler[0]!, filler[0]!.layered_image.bg);
    expect(calls.length).toBeGreaterThan(beforeFinal);
  });

  it("degrades when the host cannot rasterize", async () => {
    stubFetch();
    vi.stubGlobal("OffscreenCanvas", undefined);
    vi.stubGlobal("createImageBitmap", undefined);
    const ctx = makeContext("norender", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    expect(src).toBeUndefined();
  });
});

describe("getImagePreviewMarkupComposited", () => {
  it("states the thumbnail height inline on the composited image", async () => {
    stubRasterizer();
    stubFetch();
    const ctx = makeContext("markup", ["base", "prop"]);
    const markup = await getImagePreviewMarkupComposited(
      ctx,
      ctx.layered_image.bg,
    );
    expect(markup).toContain("src=\"data:image/webp;base64,");
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
    expect(markup).toContain(`height="${IMAGE_PREVIEW_HEIGHT}"`);
  });

  it("states it on the single-layer fallback as well", async () => {
    stubRasterizer();
    stubFetch();
    const ctx = makeContext("markupfallback", ["only"]);
    const markup = await getImagePreviewMarkupComposited(ctx, ctx.image["only"]);
    expect(markup).toContain(`style="height:${IMAGE_PREVIEW_HEIGHT}px"`);
  });
});

describe("the composite's size", () => {
  const stubArt = (art: Record<string, { w: number; h: number }>, bytesPerPixel = 0) => {
    const decodes: string[] = [];
    const canvases: string[] = [];
    vi.stubGlobal("createImageBitmap", async (blob: Blob, opts?: ImageBitmapOptions) => {
      const name = await blob.text();
      const { w, h } = art[name]!;
      const width = opts?.resizeWidth ?? (opts?.resizeHeight ? Math.round((w * opts.resizeHeight) / h) : w);
      const height = opts?.resizeHeight ?? (opts?.resizeWidth ? Math.round((h * opts.resizeWidth) / w) : h);
      decodes.push(`${name} ${width}x${height}`);
      return { width, height, close() {} };
    });
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        constructor(
          public width: number,
          public height: number,
        ) {
          canvases.push(`${width}x${height}`);
        }
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob() {
          return new Blob([new Uint8Array(Math.max(16, Math.round(this.width * this.height * bytesPerPixel)))], {
            type: "image/webp",
          });
        }
      },
    );
    return { decodes, canvases };
  };

  const portrait = { base: { w: 300, h: 400 }, prop: { w: 300, h: 400 } };

  it("keeps the hover's 360 px picture when the caller names no size", async () => {
    const { canvases } = stubArt(portrait);
    stubFetch();
    const ctx = makeContext("hoversize", ["base", "prop"]);
    expect(await getImageCompositeSrc(ctx, ctx.layered_image.bg)).toMatch(/^data:image\/webp;base64,/);
    expect(canvases).toEqual(["270x360"]);
  });

  it("draws the stack at the source art's own size when the caller asks for more", async () => {
    const { canvases, decodes } = stubArt(portrait);
    stubFetch();
    const ctx = makeContext("artsize", ["base", "prop"]);
    expect(await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 1280 })).toMatch(/^data:image\/webp;base64,/);
    expect(canvases).toEqual(["300x400"]);
    expect(decodes).toEqual(["base 300x400", "prop 300x400"]);
  });

  it("scales every layer by one factor down to the size asked for", async () => {
    const { canvases, decodes } = stubArt({ base: { w: 1500, h: 2000 }, prop: { w: 600, h: 300 } });
    stubFetch();
    const ctx = makeContext("asksize", ["base", "prop"]);
    await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 1000 });
    expect(canvases).toEqual(["750x1000"]);
    expect(decodes.slice(2)).toEqual(["base 750x1000", "prop 300x150"]);
  });

  it("never draws past the composite ceiling, which is not the thumbnails' limit", async () => {
    const { canvases } = stubArt({ base: { w: 8000, h: 8000 }, prop: { w: 8000, h: 8000 } });
    stubFetch();
    const ctx = makeContext("ceiling", ["base", "prop"]);
    await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 99999 });
    expect(COMPOSITE_MAX_EDGE).toBeGreaterThan(THUMB_MAX_WIDTH);
    expect(canvases).toEqual([`${COMPOSITE_MAX_EDGE}x${COMPOSITE_MAX_EDGE}`]);
    expect(clampThumbnailWidth(99999)).toBe(THUMB_MAX_WIDTH);
  });

  it("serves each caller its own size from the cache without evicting the other", async () => {
    const { canvases } = stubArt({ base: { w: 1500, h: 2000 }, prop: { w: 1500, h: 2000 } });
    const calls = stubFetch();
    const ctx = makeContext("twosizes", ["base", "prop"]);
    const hover = await getImageCompositeSrc(ctx, ctx.layered_image.bg);
    const inspector = await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 1280 });
    expect(canvases).toEqual(["270x360", "960x1280"]);
    const fetched = calls.length;
    expect(await getImageCompositeSrc(ctx, ctx.layered_image.bg)).toBe(hover);
    expect(await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 1280 })).toBe(inspector);
    expect(calls.length).toBe(fetched);
    expect(canvases).toHaveLength(2);
  });

  it("encodes the composite without loss, as a plain file is shown, while thumbnails stay lossy", async () => {
    const asked: unknown[] = [];
    vi.stubGlobal("createImageBitmap", async () => ({ width: 300, height: 400, close() {} }));
    vi.stubGlobal(
      "OffscreenCanvas",
      class {
        getContext() {
          return { drawImage: () => {} };
        }
        async convertToBlob(options: unknown) {
          asked.push(options);
          return new Blob([new Uint8Array(16)], { type: "image/webp" });
        }
      },
    );
    stubFetch();
    const ctx = makeContext("lossless", ["base", "prop"]);
    await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 1280 });
    await composeThumbnailBlob([{ path: "/a.png", blob: new Blob(["a"]), lastModified: 0, size: 1 }], 144);
    expect(asked).toEqual([
      { type: "image/webp", quality: 1 },
      { type: "image/webp", quality: 0.75 },
    ]);
  });

  it("steps down in size rather than dropping a composite over the data uri limit", async () => {
    const { canvases } = stubArt({ base: { w: 1500, h: 2000 }, prop: { w: 1500, h: 2000 } }, 1);
    stubFetch();
    const ctx = makeContext("stepdown", ["base", "prop"]);
    const src = await getImageCompositeSrc(ctx, ctx.layered_image.bg, { size: 2000 });
    expect(src).toMatch(/^data:image\/webp;base64,/);
    expect(src!.length).toBeLessThanOrEqual(512 * 1024);
    expect(canvases[0]).toBe("1500x2000");
    expect(canvases.length).toBeGreaterThan(1);
  });
});
