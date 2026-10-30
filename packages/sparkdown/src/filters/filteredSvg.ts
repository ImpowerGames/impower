import { normalizeSVGAttributeNames, type AttributeSelection } from "../attributes";
import { filterSVG } from "../compiler/utils/filterSVG";

export const FILTER_VERSION = 3;
export type ImageFilter = AttributeSelection;

const ATTRIBUTE_WORD = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

export const serializeImageFilterParam = (
  selection: AttributeSelection,
): string | undefined => {
  if (!selection || typeof selection !== "object" || Array.isArray(selection)) {
    return undefined;
  }
  const entries = Object.entries(selection);
  if (entries.some(([group, option]) => !ATTRIBUTE_WORD.test(group) ||
      typeof option !== "string" || !ATTRIBUTE_WORD.test(option))) {
    return undefined;
  }
  return JSON.stringify(Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)));
};

export const parseImageFilterParam = (param: string): AttributeSelection | undefined => {
  try {
    const selection: unknown = JSON.parse(param);
    const canonical = serializeImageFilterParam(selection as AttributeSelection);
    return canonical === undefined ? undefined : JSON.parse(canonical);
  } catch {
    return undefined;
  }
};

const RESOURCE_PROTOCOL = "/file:/";

export const buildFilteredSrc = (
  rootImage: { src?: unknown; ext?: unknown },
  filter: ImageFilter,
): string | undefined => {
  const src = rootImage?.src;
  if (!src || typeof src !== "string") {
    return undefined;
  }
  if (!src.startsWith(RESOURCE_PROTOCOL)) return src;
  const url = new URL(src, "https://sparkdown.invalid");
  const isSvg = rootImage?.ext === "svg" || url.pathname.toLowerCase().endsWith(".svg");
  if (!isSvg) {
    return src;
  }
  const param = serializeImageFilterParam(filter);
  if (param === undefined) {
    return src;
  }
  url.searchParams.delete("filters");
  url.searchParams.set("attributes", param);
  return url.pathname + url.search + url.hash;
};

export const filteredSvgCacheKey = (
  _path: string,
  lastModified: number,
  size: number,
  canonicalParam: string,
  contentDigest = "",
) =>
  `attributes=${encodeURIComponent(
    canonicalParam,
  )}&sig=${lastModified}-${size}&content=${contentDigest}&fv=${FILTER_VERSION}`;

export interface FilteredSvgCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<readonly { url: string }[]>;
}

export interface FilteredSvgFile extends Blob {
  lastModified: number;
}

const inFlightGenerations = new Map<string, Promise<string>>();

const sourceReads = new WeakMap<Blob, Promise<{ text: string; digest: string }>>();
export const readSvgSource = async (file: FilteredSvgFile): Promise<{ text: string; digest: string }> => {
  const pending = sourceReads.get(file);
  if (pending) {
    try { return await pending; } catch {
      if (sourceReads.get(file) === pending) sourceReads.delete(file);
      return readSvgSource(file);
    }
  }
  const read = (async () => {
    const text = normalizeSVGAttributeNames(await file.text());
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const digest = Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
    return { text, digest };
  })();
  sourceReads.set(file, read);
  try { return await read; } catch (error) {
    if (sourceReads.get(file) === read) sourceReads.delete(file);
    throw error;
  }
};

export const filteredSvgResponse = (body: string) =>
  new Response(body, {
    status: 200,
    headers: new Headers({
      "Content-Type": "image/svg+xml",
      "Cache-Control": "max-age=31536000, immutable",
    }),
  });

let warnedFilteredSvgCacheWrite = false;

const warnFilteredSvgCacheWriteFailed = (error: unknown) => {
  if (warnedFilteredSvgCacheWrite) {
    return;
  }
  warnedFilteredSvgCacheWrite = true;
  console.warn(
    "[sparkdown] Could not cache a filtered SVG variant. Art is still correct, " +
      "but every filtered image will be regenerated on each request.",
    error,
  );
};

export const getOrCreateFilteredSvg = async (
  cache: FilteredSvgCache,
  path: string,
  file: FilteredSvgFile,
  filtersParam: string,
  keyPrefix = "",
): Promise<Response | undefined> => {
  const filter = parseImageFilterParam(filtersParam);
  if (!filter) {
    return undefined;
  }
  const canonical = serializeImageFilterParam(filter);
  if (!canonical) {
    return undefined;
  }
  let source: { text: string; digest: string };
  try { source = await readSvgSource(file); } catch { return undefined; }
  const variantPrefix = `${keyPrefix}${path}?attributes=${encodeURIComponent(
    canonical,
  )}&sig=`;
  const key = `${keyPrefix}${path}?${filteredSvgCacheKey(
    path,
    file.lastModified,
    file.size,
    canonical,
    source.digest,
  )}`;
  const share = async (pending: Promise<string>) => {
    try {
      return filteredSvgResponse(await pending);
    } catch {
      return undefined;
    }
  };
  try {
    const early = inFlightGenerations.get(key);
    if (early) {
      const shared = await share(early);
      if (shared) {
        return shared;
      }
    }
    let cached: Response | undefined;
    try {
      cached = await cache.match(key);
    } catch {
    }
    if (cached) {
      return cached;
    }
    const pending = inFlightGenerations.get(key);
    if (pending) {
      const shared = await share(pending);
      if (shared) {
        return shared;
      }
    }
    const generation = (async () => {
      const filtered = filterSVG(source.text, filter);
      let stored = false;
      try {
        await cache.put(key, filteredSvgResponse(filtered));
        stored = true;
      } catch (error) {
        warnFilteredSvgCacheWriteFailed(error);
      }
      if (stored) {
        void (async () => {
          try {
            const existing = await cache.keys();
            await Promise.all(
              existing
                .filter(
                  (req) =>
                    req.url.includes(variantPrefix) && !req.url.endsWith(key),
                )
                .map((req) => cache.delete(req.url)),
            );
          } catch {}
        })();
      }
      return filtered;
    })();
    inFlightGenerations.set(key, generation);
    try {
      return filteredSvgResponse(await generation);
    } finally {
      if (inFlightGenerations.get(key) === generation) {
        inFlightGenerations.delete(key);
      }
    }
  } catch {
    return undefined;
  }
};
