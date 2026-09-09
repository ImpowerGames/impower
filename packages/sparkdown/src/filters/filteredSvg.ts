/** On-demand SVG variants keyed by a canonical attribute selection and file signature. */
import { normalizeSVGAttributeNames, type AttributeSelection } from "../attributes";
import { filterSVG } from "../compiler/utils/filterSVG";

/** Increment whenever visibility semantics change. */
export const FILTER_VERSION = 3;
export type ImageFilter = AttributeSelection;

const ATTRIBUTE_WORD = /^[a-zA-Z0-9]+(?:-[a-zA-Z0-9]+)*$/;

/** Preserve choices exactly; only the order of group keys is irrelevant. */
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

/**
 * Resolve a filtered image to a fetchable src WITHOUT the root's SVG source.
 *
 * Returns the on-demand filtered URL when the root is a service-worker-served
 * SVG; otherwise falls back to the
 * PLAIN root src (a remote or
 * raster root is unfilterable — degrading to the unfiltered image beats
 * rendering nothing). Returns `undefined` only when the root has no src at
 * all.
 */
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
  // An empty selection still hides inactive layers and applies folder defaults.
  url.searchParams.delete("filters");
  url.searchParams.set("attributes", param);
  return url.pathname + url.search + url.hash;
};

/**
 * Cache key for a filtered SVG. Keyed by the file's STABLE signature
 * (path + lastModified + size + normalized content digest), never the request
 * URL's cache-buster, plus the canonical selection and visibility version.
 */
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

/** The subset of Cache Storage this needs, so callers can pass a fake. */
export interface FilteredSvgCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<readonly { url: string }[]>;
}

/** A file to filter: its bytes plus the identity its cache key needs. */
export interface FilteredSvgFile extends Blob {
  lastModified: number;
}

/**
 * Generations currently running, keyed by cache key.
 *
 * Showing an image issues TWO simultaneous requests for the same variant url —
 * `UIModule.createImage` writes it as the element's `background-image` AND as
 * the `src` of a hidden `<img>` child — and a preload can race both. Without
 * this, each of those misses the cache (nothing is stored until the first one
 * finishes) and runs its own full read + filter + prune, so a first display
 * costs the work two or three times over (#344).
 */
const inFlightGenerations = new Map<string, Promise<string>>();

// Blob bytes are immutable. Reuse their read/hash only by object identity; two
// files with identical timestamps and lengths may still contain different art.
const sourceReads = new WeakMap<Blob, Promise<{ text: string; digest: string }>>();
const readSource = async (file: FilteredSvgFile): Promise<{ text: string; digest: string }> => {
  const pending = sourceReads.get(file);
  if (pending) {
    try { return await pending; } catch {
      if (sourceReads.get(file) === pending) sourceReads.delete(file);
      return readSource(file);
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

/**
 * A fresh response per caller, over the shared filtered SOURCE.
 *
 * Deliberately not `clone()`: cloning tees the body, so every clone leaves a
 * branch that has to be read or the other branch stalls behind it. Re-wrapping
 * a string has no such coupling and costs nothing here.
 */
export const filteredSvgResponse = (body: string) =>
  new Response(body, {
    status: 200,
    headers: new Headers({
      "Content-Type": "image/svg+xml",
      "Cache-Control": "max-age=31536000, immutable",
    }),
  });

let warnedFilteredSvgCacheWrite = false;

/**
 * Announce a refused cache write once per worker.
 *
 * A cache that cannot be written still serves correct art, but re-filters on
 * every single fetch, which is a large silent cost on a project with many
 * variants. Logging it per request would bury it under the images themselves,
 * so this says it once and stays quiet.
 */
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

/**
 * Cached-or-freshly-filtered SVG response for one file, or `undefined` if the
 * param is garbage or the source cannot be read/filtered (caller serves the
 * unfiltered original). Cache lookup/write failures do not discard valid art.
 *
 * On a fresh generation, entries for the SAME path+attributes at an OLDER file
 * signature are pruned — variants accumulate per edit otherwise and nothing
 * else ever deletes them (the activate sweep deliberately keeps this bucket).
 *
 * Concurrent callers for one variant share a single generation and each gets
 * its own `Response` over the shared source. Sharing is best-effort, never
 * load-bearing: a caller that arrives just outside the window, or whose shared
 * generation FAILED, falls back to generating for itself — so one transient
 * source-read error can't turn into every concurrent caller serving unfiltered
 * art.
 */
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
  // Re-canonicalize so every URL spelling of the same selection shares one
  // cache entry, including the empty selection that applies resting defaults.
  const canonical = serializeImageFilterParam(filter);
  if (!canonical) {
    return undefined;
  }
  let source: { text: string; digest: string };
  try { source = await readSource(file); } catch { return undefined; }
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
  // Checked BEFORE the cache, and again after: `cache.match` is a yield point,
  // so a caller that started before the winner's `cache.put` can resume after
  // it, seeing neither a cache entry nor (if only checked once) a generation.
  const share = async (pending: Promise<string>) => {
    try {
      return filteredSvgResponse(await pending);
    } catch {
      // The shared generation failed. Don't inherit its failure — falling
      // through to `undefined` would make the service worker serve the
      // UNFILTERED svg, i.e. visibly wrong art, for every caller at once.
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
      // Cache Storage is an optimization. An unavailable cache is a miss,
      // never a reason to serve the original SVG with every layer visible.
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
      // Memoisation is an optimisation, so failing it costs the cache hit and
      // nothing else. Letting the write reject here would reject the whole
      // generation, and `undefined` is this function's "could not filter"
      // signal — the service worker answers it by serving the UNFILTERED
      // original, i.e. correct-looking art with every filterable node drawn at
      // once, at 200, with nothing logged (#477). The markup is already in
      // hand at this point; it must survive a storage failure.
      let stored = false;
      try {
        await cache.put(key, filteredSvgResponse(filtered));
        stored = true;
      } catch (error) {
        warnFilteredSvgCacheWriteFailed(error);
      }
      // Prune superseded signatures of this exact variant AFTER responding.
      // `cache.keys()` enumerates the whole bucket, so on the critical path it
      // makes every generation cost O(entries) — and warming a project's whole
      // variant set turns that into O(n^2) on the very thread that has to serve
      // the image the user is waiting for. Housekeeping, so best-effort: if the
      // service worker is torn down first, the next generation prunes instead.
      // Only when this generation actually stored something: with no new entry
      // to supersede them, the older signatures are the only copies there are.
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
      // Only if it is still OURS: a caller whose shared generation failed
      // registers a replacement, and an unconditional delete here would strand
      // that one for everybody behind it.
      if (inFlightGenerations.get(key) === generation) {
        inFlightGenerations.delete(key);
      }
    }
  } catch {
    return undefined;
  }
};
