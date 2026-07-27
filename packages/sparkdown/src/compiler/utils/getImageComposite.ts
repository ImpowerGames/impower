import {
  composeThumbnailBlob,
  thumbnailCacheKey,
  type ThumbnailSource,
} from "../../thumbnails/composeThumbnail";
import { getImagePreviewMarkup, getImagePreviewSrc } from "./getImagePreviewSrc";
import { resolveImageLayerSrcs } from "./resolveImageLayerSrcs";

/**
 * Flatten a `layered_image`'s layers into a single thumbnail so previews show
 * what the asset actually looks like instead of just its base plate.
 *
 * Why one flattened image rather than stacked HTML: VS Code's markdown
 * sanitizer drops `style` and `class`, so a CSS stack works in the editor and
 * silently collapses there. One `<img src>` is the only markup both hosts
 * render identically.
 *
 * Generation itself is shared with the editor's service-worker thumbnails —
 * see `composeThumbnail`. This module only adds the language-server concerns:
 * resolving a struct to its layers, fetching them, and caching per session.
 */

/** 2x the width the completion panel displays, so it stays sharp on retina. */
const PREVIEW_WIDTH = 360;

/**
 * Ceiling for the generated data URI. Anything past this suggests something
 * pathological; fall back rather than risk a host's string handling.
 */
const MAX_BYTES = 512 * 1024;

/** Per-session cache. Keyed by content, so nothing needs to invalidate it. */
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

/**
 * Fetch one layer's bytes along with the metadata its cache key needs.
 *
 * `fetch` covers impower-dev, where layer srcs are served urls. It does NOT
 * cover VS Code, whose srcs are workspace uris a worker can't fetch — that
 * host needs bytes handed to it over the extension bridge (see #292), and
 * until then falls back to the single-layer preview.
 */
const loadLayer = async (src: string): Promise<ThumbnailSource | undefined> => {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      return undefined;
    }
    const blob = await response.blob();
    const lastModified = Date.parse(
      response.headers.get("last-modified") || "",
    );
    return {
      // Strip the `?v=` cache-buster: it is re-stamped on every load, so
      // leaving it in would make the key miss every time.
      path: src.split("?")[0] || src,
      blob,
      lastModified: Number.isFinite(lastModified) ? lastModified : 0,
      size: blob.size,
    };
  } catch {
    return undefined;
  }
};

/**
 * Composited data URI for a struct, or `undefined` when compositing isn't
 * possible or isn't worth it (fewer than two layers, no canvas, an
 * un-fetchable layer, or an oversized result).
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
  // Provisional key from the srcs, to avoid re-fetching layers on every
  // keystroke's worth of resolves. Replaced below by the stable signature key
  // once the responses tell us each layer's real identity.
  const provisionalKey = layers.join("|");
  const provisional = cacheGet(provisionalKey);
  if (provisional !== undefined) {
    return provisional || undefined;
  }

  const sources = await Promise.all(layers.map(loadLayer));
  if (sources.some((s) => !s)) {
    // Cache the failure: retrying a fetch that can't work in this host on
    // every resolve would be worse than one stale miss.
    cacheSet(provisionalKey, "");
    return undefined;
  }
  const loaded = sources as ThumbnailSource[];

  const key = thumbnailCacheKey(loaded, PREVIEW_WIDTH);
  const cached = cacheGet(key);
  if (cached !== undefined) {
    cacheSet(provisionalKey, cached);
    return cached || undefined;
  }

  const blob = await composeThumbnailBlob(loaded, PREVIEW_WIDTH);
  if (!blob) {
    cacheSet(key, "");
    cacheSet(provisionalKey, "");
    return undefined;
  }
  const uri = toDataUri(new Uint8Array(await blob.arrayBuffer()), blob.type);
  const value = uri.length > MAX_BYTES ? "" : uri;
  cacheSet(key, value);
  cacheSet(provisionalKey, value);
  return value || undefined;
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
