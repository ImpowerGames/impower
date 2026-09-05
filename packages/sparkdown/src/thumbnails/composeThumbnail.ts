/**
 * Shared thumbnail generation for asset previews.
 *
 * Two callers, deliberately one implementation:
 *  - impower-dev's service worker, answering `?thumb=<width>` with an HTTP
 *    response it caches in Cache Storage.
 *  - the language server, inlining the result as a `data:` URI for hosts with
 *    no service worker to intercept a URL (VS Code, where a workspace uri does
 *    not render in a hover — see `getImageComposite`).
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
export const THUMB_VERSION = 2;

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
 * by its url. Asset urls now carry a signature-derived `?v=<mtime>-<size>`
 * stamp, but this cache still computes its own key from the file it was
 * handed: the url stamp can fall back to a mint-time value when no mtime was
 * known, and parsing identity back out of a url is exactly the coupling this
 * key discipline exists to avoid. The signature only moves when the bytes
 * actually do, so a real edit still invalidates.
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
    const tallest = Math.max(...bitmaps.map((b) => b.height));
    if (tallest > width) {
      // Fitting the width alone bounds nothing on a tall source: a 200 x 6000
      // strip fitted to 360 wide becomes 360 x 10800, which encodes to well
      // over a megabyte and is then thrown away for exceeding the caller's
      // size ceiling — so the preview shows nothing at all.
      //
      // Shrink the whole set by ONE common factor, chosen so the tallest layer
      // lands exactly on the box. A uniform factor is what keeps a composite's
      // layers registered against each other; re-fitting each layer to the box
      // independently would rescale them unequally and pull the stack apart,
      // and would still let a very wide layer overhang. The second decode only
      // happens for extreme aspect ratios.
      const scale = width / tallest;
      const previous = bitmaps;
      bitmaps = [];
      previous.forEach((b) => b?.close());
      const fitted = Math.max(1, Math.round(width * scale));
      bitmaps = await Promise.all(
        sources.map((s) =>
          createImageBitmap(s.blob, {
            resizeWidth: fitted,
            resizeQuality: "low",
          }),
        ),
      );
    }
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

/**
 * Base64-encode bytes in chunks.
 *
 * Chunked because `String.fromCharCode(...bytes)` on a whole image throws
 * RangeError past roughly 100k elements — and a real asset is far bigger than
 * that, so the unchunked form fails on exactly the files a thumbnail is most
 * wanted for.
 */
export const bytesToBase64 = (bytes: Uint8Array) => {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...(bytes.subarray(i, i + CHUNK) as unknown as number[]),
    );
  }
  return btoa(binary);
};

/** The subset of Cache Storage this needs, so callers can pass a fake. */
export interface ThumbnailCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

/** A file to thumbnail: its bytes plus the identity its cache key needs. */
export interface ThumbnailFile extends Blob {
  lastModified: number;
}

/**
 * Cached-or-freshly-generated thumbnail response for one file, or `undefined`
 * if it can't be generated (caller serves the original).
 *
 * The cache is a parameter rather than reached for directly so this is
 * testable outside a service worker — and so the same logic could be backed by
 * something other than Cache Storage (VS Code would use extension storage).
 */
export const getOrCreateThumbnail = async (
  cache: ThumbnailCache,
  path: string,
  file: ThumbnailFile,
  thumbParam: string,
  keyPrefix = "",
): Promise<Response | undefined> => {
  const requested = Math.floor(Number(thumbParam)) || 0;
  if (!Number.isFinite(requested) || requested < THUMB_MIN_WIDTH) {
    // Garbage or absurdly small: not a thumbnail request worth honouring.
    return undefined;
  }
  const maxWidth = clampThumbnailWidth(requested);
  const key = `${keyPrefix}${path}?${thumbnailCacheKey(
    [{ path, lastModified: file.lastModified, size: file.size }],
    maxWidth,
  )}`;
  try {
    const cached = await cache.match(key);
    if (cached) {
      return cached;
    }
    const blob = await composeThumbnailBlob(
      [{ path, blob: file, lastModified: file.lastModified, size: file.size }],
      maxWidth,
    );
    if (!blob) {
      return undefined;
    }
    const response = new Response(blob, {
      status: 200,
      headers: new Headers({
        "Content-Type": MIME,
        "Content-Length": String(blob.size),
        "Cache-Control": "max-age=31536000, immutable",
      }),
    });
    await cache.put(key, response.clone());
    return response;
  } catch {
    return undefined;
  }
};
