export const THUMB_VERSION = 2;

export const THUMB_MIN_WIDTH = 16;
export const THUMB_MAX_WIDTH = 512;

const MIME = "image/webp";
const QUALITY = 0.75;

export interface ThumbnailSource {
  path: string;
  blob: Blob;
  lastModified: number;
  size: number;
}

export const clampThumbnailWidth = (requested: unknown) => {
  const n = Math.floor(Number(requested)) || 0;
  return Math.max(THUMB_MIN_WIDTH, Math.min(THUMB_MAX_WIDTH, n));
};

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

export interface ThumbnailCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

export interface ThumbnailFile extends Blob {
  lastModified: number;
}

let warnedThumbnailCacheWrite = false;

const warnThumbnailCacheWriteFailed = (error: unknown) => {
  if (warnedThumbnailCacheWrite) {
    return;
  }
  warnedThumbnailCacheWrite = true;
  console.warn(
    "[sparkdown] Could not cache a generated thumbnail. Thumbnails are still " +
      "correct, but will be regenerated on each request.",
    error,
  );
};

export const getOrCreateThumbnail = async (
  cache: ThumbnailCache,
  path: string,
  file: ThumbnailFile,
  thumbParam: string,
  keyPrefix = "",
): Promise<Response | undefined> => {
  const requested = Math.floor(Number(thumbParam)) || 0;
  if (!Number.isFinite(requested) || requested < THUMB_MIN_WIDTH) {
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
    const respond = () =>
      new Response(blob, {
        status: 200,
        headers: new Headers({
          "Content-Type": MIME,
          "Content-Length": String(blob.size),
          "Cache-Control": "max-age=31536000, immutable",
        }),
      });
    const response = respond();
    try {
      await cache.put(key, respond());
    } catch (error) {
      warnThumbnailCacheWriteFailed(error);
    }
    return response;
  } catch {
    return undefined;
  }
};
