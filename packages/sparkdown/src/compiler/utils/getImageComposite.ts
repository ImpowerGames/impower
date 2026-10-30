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

export type ReadFileBytes = (uri: string) => Promise<string | undefined>;

export interface ImageCompositeOptions {
  readFileBytes?: ReadFileBytes;
  morphRest?: (
    context: { [type: string]: { [name: string]: any } } | undefined,
    struct: any,
  ) => Promise<string | undefined>;
}

// workaround(vscode): the markdown hover sanitizer drops style and class, so a layered image is flattened to one <img src> instead of a CSS stack

const PREVIEW_WIDTH = 360;

// workaround(vscode): the markdown sanitizer strips vscode-vfs:, vscode-userdata: and vscode-resource: img srcs, so those are inlined as data: uris
const DIRECTLY_LOADABLE_SCHEMES = new Set(["http", "https", "data", "file"]);

const isDirectlyLoadable = (src: string) => {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(src)?.[1];
  return !scheme || DIRECTLY_LOADABLE_SCHEMES.has(scheme.toLowerCase());
};

const MAX_BYTES = 512 * 1024;

const MAX_CACHE_ENTRIES = 64;
const sharedCache = new Map<string, string>();
const bridgeCaches = new WeakMap<ReadFileBytes, Map<string, string>>();

const cacheGet = (cache: Map<string, string>, key: string) => {
  const hit = cache.get(key);
  if (hit !== undefined) {
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
};

const cacheSet = (cache: Map<string, string>, key: string, value: string) => {
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
  const path = layer.src;
  const identify = async (blob: Blob): Promise<string> => {
    const hash = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    return JSON.stringify([path, digest]);
  };
  try {
    const response = await fetch(layer.src, /\.url(?:[?#]|$)/i.test(layer.uri ?? "")
      ? {cache: "no-cache"}
      : undefined);
    if (response.ok) {
      const blob = await response.blob();
      const lastModified = Date.parse(
        response.headers.get("last-modified") || "",
      );
      return {
        path: await identify(blob),
        blob,
        lastModified: Number.isFinite(lastModified) ? lastModified : 0,
        size: blob.size,
      };
    }
  } catch {
  }
  if (readFileBytes && layer.uri) {
    try {
      const base64 = await readFileBytes(layer.uri);
      if (base64) {
        const blob = base64ToBlob(base64);
        return { path: await identify(blob), blob, lastModified: 0, size: blob.size };
      }
    } catch {
      return undefined;
    }
  }
  return undefined;
};

export const resolvePreviewLayers = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  options?: ImageCompositeOptions,
): Promise<(ImageLayer & { rest?: true })[]> => {
  const layers = resolveImageLayers(context, struct);
  const morphRest = options?.morphRest;
  if (!morphRest) return layers;
  return Promise.all(
    layers.map(async (layer) => {
      const rest = layer.struct ? await morphRest(context, layer.struct) : undefined;
      return rest ? { src: `data:image/svg+xml,${encodeURIComponent(rest)}`, rest: true as const } : layer;
    }),
  );
};

export const getImageCompositeSrc = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  options?: ImageCompositeOptions,
): Promise<string | undefined> => {
  const layers = await resolvePreviewLayers(context, struct, options);
  if (layers.length === 0) {
    return undefined;
  }
  if (layers.length === 1 && isDirectlyLoadable(layers[0]!.src)) {
    return layers[0]!.rest ? layers[0]!.src : undefined;
  }
  const bridge = options?.readFileBytes;
  let cache = sharedCache;
  if (bridge) {
    cache = bridgeCaches.get(bridge) ?? new Map<string, string>();
    bridgeCaches.set(bridge, cache);
  }
  const provisionalKey = layers.every(layer => layer.version !== undefined || layer.src.startsWith("data:"))
    ? JSON.stringify(layers.map(layer => [layer.src, layer.uri, layer.version]))
    : undefined;
  const provisional = provisionalKey === undefined ? undefined : cacheGet(cache, provisionalKey);
  if (provisional !== undefined) {
    return provisional || undefined;
  }

  const sources = await Promise.all(
    layers.map((layer) => loadLayer(layer, options?.readFileBytes)),
  );
  if (sources.some((s) => !s)) {
    if (!bridge && provisionalKey !== undefined) cacheSet(cache, provisionalKey, "");
    return undefined;
  }
  const loaded = sources as ThumbnailSource[];

  const key = thumbnailCacheKey(loaded, PREVIEW_WIDTH);
  const cached = cacheGet(cache, key);
  if (cached !== undefined) {
    if (provisionalKey !== undefined) cacheSet(cache, provisionalKey, cached);
    return cached || undefined;
  }

  const blob = await composeThumbnailBlob(loaded, PREVIEW_WIDTH);
  if (!blob) {
    if (!bridge) {
      cacheSet(cache, key, "");
      if (provisionalKey !== undefined) cacheSet(cache, provisionalKey, "");
    }
    return undefined;
  }
  const uri = toDataUri(new Uint8Array(await blob.arrayBuffer()), blob.type);
  const value = uri.length > MAX_BYTES ? "" : uri;
  cacheSet(cache, key, value);
  if (provisionalKey !== undefined) cacheSet(cache, provisionalKey, value);
  return value || undefined;
};

export const getImagePreviewMarkupComposited = async (
  context: { [type: string]: { [name: string]: any } } | undefined,
  struct: any,
  options?: ImageCompositeOptions,
): Promise<string | undefined> => {
  const name = struct?.["$name"] ?? "";
  const rest = await options?.morphRest?.(context, struct);
  if (rest) {
    return buildImagePreviewMarkup(`data:image/svg+xml,${encodeURIComponent(rest)}`, name);
  }
  const composite = await getImageCompositeSrc(context, struct, options);
  if (composite) {
    return buildImagePreviewMarkup(composite, name);
  }
  if (getImagePreviewSrc(context, struct)) {
    return getImagePreviewMarkup(context, struct);
  }
  return undefined;
};
