import {
  bytesToBase64,
  composeThumbnailBlob,
  thumbnailCacheKey,
  type ThumbnailSource,
} from "../../thumbnails/composeThumbnail";
import {
  buildImagePreviewMarkup,
  getImagePreviewMarkup,
  getImagePreviewSrc,
} from "./getImagePreviewSrc";
import { resolveImageLayers, type ImageLayer } from "./resolveImageLayers";

/**
 * Reads a workspace file's bytes as base64, for hosts where a layer's `src`
 * isn't fetchable from the language server.
 *
 * VS Code is the case: its srcs are workspace uris (`file:`/`vscode-vfs:`)
 * that a worker cannot `fetch`, and only the extension host can read them —
 * so the bytes have to come back over the extension bridge. impower-dev
 * serves its assets over http and never needs this.
 */
export type ReadFileBytes = (uri: string) => Promise<string | undefined>;

export interface ImageCompositeOptions {
  readFileBytes?: ReadFileBytes;
}

/**
 * Turn an image-ish struct into a single thumbnail a preview can display:
 * flattening a `layered_image`'s layers so previews show what the asset
 * actually looks like instead of just its base plate, and inlining a lone
 * image whose source the host cannot load on its own.
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
 * Schemes a markdown host renders straight from an `<img src>`.
 *
 * A src carrying no scheme at all is a path resolved against the host page —
 * impower-dev's assets are served that way — and is equally loadable, so the
 * test is "an explicit scheme outside this set", not "not in this set".
 *
 * `file:` is here because desktop VS Code rewrites it. Measured on 1.136.1 by
 * emitting a real on-disk image into a hover and into the completion details
 * pane and reading both back: the src arrives as `vscode-file://vscode-app/…`
 * and the picture loads at its natural size. So a desktop workspace uri needs
 * no help, and inlining one would spend an encode to get a smaller picture.
 * That rewrite landed in VS Code 1.60 (microsoft/vscode#119786), long before
 * the 1.97 this extension requires.
 *
 * What is left out is left out because it was measured to fail, by emitting
 * one `<img>` per scheme and reading the DOM back: the markdown sanitizer
 * strips `vscode-vfs:` (VS Code for Web's workspace scheme), `vscode-userdata:`
 * and `vscode-resource:` off the element entirely. Those get an inlined `data:`
 * uri built from bytes read over the host's `readFileBytes` bridge, the one
 * route no host refuses.
 *
 * Keep this an allowlist of what is known to render. A scheme nobody has
 * measured should fall to the bridge, which is slower and always works, rather
 * than to a blank image.
 */
const DIRECTLY_LOADABLE_SCHEMES = new Set(["http", "https", "data", "file"]);

const isDirectlyLoadable = (src: string) => {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(src)?.[1];
  return !scheme || DIRECTLY_LOADABLE_SCHEMES.has(scheme.toLowerCase());
};

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

const toDataUri = (bytes: Uint8Array, mime: string) =>
  `data:${mime};base64,${bytesToBase64(bytes)}`;

/**
 * Fetch one layer's bytes along with the metadata its cache key needs.
 *
 * `fetch` covers impower-dev, where layer srcs are served urls. It does NOT
 * cover VS Code, whose srcs are workspace uris a worker can't fetch — that
 * host hands the bytes over the extension bridge instead. A host offering
 * neither route gets `undefined`, and the caller falls back to plain markup.
 */
const base64ToBlob = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes]);
};

const loadLayer = async (
  layer: ImageLayer,
  readFileBytes?: ReadFileBytes,
): Promise<ThumbnailSource | undefined> => {
  // Strip the `?v=` cache-buster from the key: it is re-stamped on load, so
  // leaving it in would miss the cache every time.
  const path = layer.src.split("?")[0] || layer.src;
  try {
    const response = await fetch(layer.src);
    if (response.ok) {
      const blob = await response.blob();
      const lastModified = Date.parse(
        response.headers.get("last-modified") || "",
      );
      return {
        path,
        blob,
        lastModified: Number.isFinite(lastModified) ? lastModified : 0,
        size: blob.size,
      };
    }
  } catch {
    // Fall through to the bridge — an un-fetchable src is expected in VS Code,
    // not an error.
  }
  if (readFileBytes && layer.uri) {
    try {
      const base64 = await readFileBytes(layer.uri);
      if (base64) {
        const blob = base64ToBlob(base64);
        return { path, blob, lastModified: 0, size: blob.size };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
};

/**
 * Inlined data URI for a struct, or `undefined` when generating one isn't
 * possible or isn't worth it (nothing resolved, no canvas, an un-fetchable
 * layer, or an oversized result).
 *
 * Two cases reach the generator. Several layers are flattened into one image.
 * A single layer is inlined only when the host cannot load its source as it
 * stands — otherwise the plain resolver's `<img src>` is cheaper and sharper,
 * and re-encoding it would buy nothing.
 */
export const getImageCompositeSrc = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  options?: ImageCompositeOptions,
): Promise<string | undefined> => {
  const layers = resolveImageLayers(context, struct);
  if (layers.length === 0) {
    return undefined;
  }
  if (layers.length === 1 && isDirectlyLoadable(layers[0]!.src)) {
    // Nothing to flatten and nothing to rescue — the plain resolver already
    // returns the right thing.
    return undefined;
  }
  // Provisional key from the srcs, to avoid re-fetching layers on every
  // keystroke's worth of resolves. Replaced below by the stable signature key
  // once the responses tell us each layer's real identity.
  const provisionalKey = layers.map((l) => l.src).join("|");
  const provisional = cacheGet(provisionalKey);
  if (provisional !== undefined) {
    return provisional || undefined;
  }

  const sources = await Promise.all(
    layers.map((layer) => loadLayer(layer, options?.readFileBytes)),
  );
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

/**
 * Preview markup for an image-ish struct, inlining a generated thumbnail when
 * the host can build one and falling back to the plain resolved source when it
 * can't.
 */
export const getImagePreviewMarkupComposited = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  options?: ImageCompositeOptions,
): Promise<string | undefined> => {
  const composite = await getImageCompositeSrc(context, struct, options);
  if (composite) {
    const name = struct?.["$name"] ?? "";
    return buildImagePreviewMarkup(composite, name);
  }
  // Either a source the host loads as it stands, or one no thumbnail could be
  // built from.
  if (getImagePreviewSrc(context, struct)) {
    return getImagePreviewMarkup(context, struct);
  }
  return undefined;
};
