import { getImagePreviewMarkup, getImagePreviewSrc } from "./getImagePreviewSrc";
import { resolveImageLayerSrcs } from "./resolveImageLayerSrcs";

/**
 * Composite a `layered_image`'s layers into a single thumbnail so previews can
 * show what the asset actually looks like.
 *
 * Why a raster composite rather than stacked HTML: VS Code's markdown
 * sanitizer drops `style` and `class`, so any CSS-based stack silently
 * collapses there while working in the editor. The only markup both hosts
 * render identically is one `<img src>` — so the layers have to be flattened
 * before they reach the renderer.
 *
 * Why raster rather than an SVG wrapper: an SVG loaded through `<img>` runs in
 * secure static mode and cannot pull in external resources, and a markup splice
 * cannot mix an SVG layer with a PNG one. Canvas does not care what each layer
 * was, and its output is bounded by the thumbnail size rather than by how much
 * detail the artist drew.
 *
 * Everything here degrades to the existing single-layer preview rather than
 * failing: no canvas in this host, an un-fetchable layer, or an oversized
 * result all fall back to `getImagePreviewMarkup`.
 */

/** 2x the 180px the completion panel displays, so it stays sharp on retina. */
const MAX_HEIGHT = 360;

/**
 * Ceiling for the generated data URI. A composite over this is a sign
 * something is wrong (huge source art, a pathological layer count) and is not
 * worth risking against a host's string handling — fall back instead.
 */
const MAX_BYTES = 512 * 1024;

const MIME = "image/webp";
const QUALITY = 0.8;

/** Bounded cache. Keyed by content, so no explicit invalidation is needed. */
const MAX_CACHE_ENTRIES = 64;
const cache = new Map<string, string>();

const cacheGet = (key: string) => {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency so the working set survives eviction.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
};

const cacheSet = (key: string, value: string) => {
  cache.set(key, value);
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next();
    if (oldest.done) {
      break;
    }
    cache.delete(oldest.value);
  }
};

const canComposite = () =>
  typeof OffscreenCanvas !== "undefined" &&
  typeof createImageBitmap === "function" &&
  typeof fetch === "function";

const toDataUri = (bytes: Uint8Array, mime: string) => {
  // Chunked so a large buffer doesn't blow the argument limit on `apply`.
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(
      ...(bytes.subarray(i, i + CHUNK) as unknown as number[]),
    );
  }
  return `data:${mime};base64,${btoa(binary)}`;
};

const loadLayer = async (src: string) => {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return undefined;
    }
    const blob = await response.blob();
    return await createImageBitmap(blob);
  } catch {
    // An un-fetchable layer is expected in some hosts (see #292) — the caller
    // falls back to the single-layer preview rather than showing nothing.
    return undefined;
  }
};

/**
 * Build the composited data URI for a struct, or `undefined` when compositing
 * isn't possible or isn't worth it (fewer than two layers, no canvas, a layer
 * that won't load, or an oversized result).
 */
export const getImageCompositeSrc = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
): Promise<string | undefined> => {
  const layers = resolveImageLayerSrcs(context, struct);
  if (layers.length < 2) {
    // Nothing to flatten — the plain resolver already returns the right thing.
    return undefined;
  }
  // Layer srcs carry the workspace's `?v=` cache-buster, so the joined list is
  // a content key: a changed layer or a changed definition changes the key and
  // misses the cache on its own. No invalidation hook to keep in sync.
  const key = layers.join("|");
  const cached = cacheGet(key);
  if (cached !== undefined) {
    return cached || undefined;
  }
  if (!canComposite()) {
    return undefined;
  }

  const bitmaps = await Promise.all(layers.map(loadLayer));
  if (bitmaps.some((b) => !b)) {
    bitmaps.forEach((b) => b?.close());
    // Cache the failure too — retrying a broken fetch on every keystroke's
    // worth of completion resolves would be worse than one stale miss.
    cacheSet(key, "");
    return undefined;
  }

  const loaded = bitmaps as ImageBitmap[];
  const width = Math.max(...loaded.map((b) => b.width));
  const height = Math.max(...loaded.map((b) => b.height));
  if (!width || !height) {
    loaded.forEach((b) => b.close());
    cacheSet(key, "");
    return undefined;
  }
  const scale = Math.min(1, MAX_HEIGHT / height);
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));

  try {
    const canvas = new OffscreenCanvas(w, h);
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    // `assets` is ordered bottom-to-top: UIModule reverses it for CSS
    // `background-image` (which paints its first layer on top), so drawing in
    // array order reproduces what the game shows.
    for (const bitmap of loaded) {
      ctx.drawImage(bitmap, 0, 0, w, h);
    }
    const blob = await canvas.convertToBlob({ type: MIME, quality: QUALITY });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const uri = toDataUri(bytes, blob.type || MIME);
    if (uri.length > MAX_BYTES) {
      cacheSet(key, "");
      return undefined;
    }
    cacheSet(key, uri);
    return uri;
  } catch {
    cacheSet(key, "");
    return undefined;
  } finally {
    loaded.forEach((b) => b.close());
  }
};

const escapeAttribute = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Preview markup for an image-ish struct, compositing layered images when the
 * host can and falling back to the single-layer preview when it can't.
 */
export const getImagePreviewMarkupComposited = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
): Promise<string | undefined> => {
  const composite = await getImageCompositeSrc(context, struct);
  if (composite) {
    const name = struct?.["$name"] ?? "";
    return `<img src="${escapeAttribute(composite)}" alt="${escapeAttribute(
      name,
    )}" height="180" />`;
  }
  // Either a single-layer asset or a host/asset that can't be composited.
  if (getImagePreviewSrc(context, struct)) {
    return getImagePreviewMarkup(context, struct);
  }
  return undefined;
};
