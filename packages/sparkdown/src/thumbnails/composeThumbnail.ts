/**
 * Shared thumbnail generation for asset previews.
 *
 * Two callers, deliberately one implementation:
 *  - impower-dev's service worker, answering `?thumb=<width>` with an HTTP
 *    response it caches in Cache Storage.
 *  - the language server, inlining the result as a `data:` URI for hosts with
 *    no service worker to intercept a URL (VS Code, where the markdown
 *    sanitizer also refuses any non-http(s) src).
 *
 * Only the DELIVERY differs between those two. Generation, sizing and the
 * cache-key discipline are identical, so they live here — if they drift, the
 * editor and the completion popup start disagreeing about what an asset looks
 * like, which is exactly the class of bug this whole area keeps producing.
 */

/**
 * Bump to invalidate every previously generated thumbnail when the generation
 * logic changes (encoder, quality, sizing). Callers fold this into their cache
 * key; nothing else needs to know.
 */
export const THUMB_VERSION = 1;

export const THUMB_MIN_WIDTH = 16;
export const THUMB_MAX_WIDTH = 512;

const MIME = "image/webp";
const QUALITY = 0.75;

/** A layer's stable identity — NOT its url. See `thumbnailCacheKey`. */
export interface ThumbnailSource {
  /** Workspace path, used for the cache key. */
  path: string;
  /** Bytes to decode. A `Blob`/`File` is passed straight to the decoder. */
  blob: Blob;
  /** Last-modified stamp, used for the cache key. */
  lastModified: number;
  /** Byte length, used for the cache key. */
  size: number;
}

export const clampThumbnailWidth = (requested: unknown) => {
  const n = Math.floor(Number(requested)) || 0;
  return Math.max(THUMB_MIN_WIDTH, Math.min(THUMB_MAX_WIDTH, n));
};

/**
 * Cache key for a thumbnail of `sources` at `maxWidth`.
 *
 * Keyed by each layer's STABLE signature — path + lastModified + size — never
 * by its url. Asset urls carry a `?v=${Date.now()}` cache-buster that the
 * workspace re-stamps on load, so a url-derived key regenerates everything on
 * every page load and leaks orphaned entries. The signature only moves when
 * the bytes actually do, so a real edit still invalidates.
 */
export const thumbnailCacheKey = (
  sources: readonly Pick<
    ThumbnailSource,
    "path" | "lastModified" | "size"
  >[],
  maxWidth: number,
) => {
  const sig = sources
    .map((s) => `${s.path}:${s.lastModified}-${s.size}`)
    .join("|");
  return `thumb=${maxWidth}&sig=${sig}&tv=${THUMB_VERSION}`;
};

/**
 * Decode `sources`, stack them, and encode one WebP thumbnail.
 *
 * A single source is just the degenerate case of a composite, so the editor's
 * per-file thumbnails and a layered image's flattened preview take the same
 * path.
 *
 * Order is BOTTOM-FIRST — `UIModule.createImage` reverses the asset list for
 * CSS `background-image` (whose first entry paints on top), so array order here
 * reproduces what the game shows. Reversing this silently inverts every
 * layered image.
 *
 * Returns `undefined` if this host can't rasterize or anything fails to
 * decode; callers fall back rather than showing a broken image.
 */
export const composeThumbnailBlob = async (
  sources: readonly ThumbnailSource[],
  maxWidth: number,
): Promise<Blob | undefined> => {
  if (!sources.length || !canRasterize()) {
    return undefined;
  }
  const width = clampThumbnailWidth(maxWidth);
  let bitmaps: ImageBitmap[] = [];
  try {
    // Decode AND downscale in one pass: `resizeWidth` makes the decoder emit a
    // small bitmap directly instead of allocating the full multi-megapixel
    // image and scaling it on a canvas afterwards — much less memory and CPU,
    // which matters most here because a composite decodes several layers at
    // once. (Sources narrower than maxWidth upscale slightly, harmless at
    // thumbnail size.)
    bitmaps = await Promise.all(
      sources.map((s) =>
        createImageBitmap(s.blob, {
          resizeWidth: width,
          resizeQuality: "low",
        }),
      ),
    );
    const w = Math.max(...bitmaps.map((b) => b.width));
    const h = Math.max(...bitmaps.map((b) => b.height));
    if (!w || !h) {
      return undefined;
    }
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    for (const bitmap of bitmaps) {
      // Each layer keeps its own decoded size rather than being stretched to
      // the canvas: same-size layers (the convention) are unaffected, and an
      // odd-sized one is better anchored than distorted.
      ctx.drawImage(bitmap, 0, 0);
    }
    return await canvas.convertToBlob({ type: MIME, quality: QUALITY });
  } catch {
    return undefined;
  } finally {
    bitmaps.forEach((b) => b?.close());
  }
};

const canRasterize = () =>
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function";
