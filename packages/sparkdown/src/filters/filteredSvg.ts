/**
 * Shared on-demand SVG filtering for `filtered_image` (#299).
 *
 * Instead of embedding every SVG's source in `program.context` (7.5MB of the
 * 8.9MB program payload on a large project) just so `filterImage` can compute
 * `filtered_src` data-URIs, hosts that serve `/file:/` through a service
 * worker resolve a filtered image to a URL: the engine builds
 * `<root src>&filters=<canonical>` synchronously, and the service worker runs
 * `filterSVG` lazily on first fetch, cached per (file signature x filter
 * combo) — the same discipline as `?thumb=` (see thumbnails/composeThumbnail).
 *
 * Hosts with no service worker (VS Code's webviews, LS-side previews) keep
 * the inlined-data path; `filterImage` only falls back to URL building when a
 * root image carries no `data`.
 *
 * ⚠ The canonical serialization below is written against
 * `filterMatchesName`'s ACTUAL semantics, which defeat set intuition:
 *  - `excludes` entries are OR'd and falsy entries are no-ops — safe to drop,
 *    dedupe and sort.
 *  - `includes` uses `every((tag) => tag && !nameContainsTag(...))`:
 *    - ANY falsy entry short-circuits the clause to false — i.e. a falsy
 *      include DISABLES include-based removal entirely (`default_filter`
 *      deliberately injects `[""]` for exactly this).
 *    - An EMPTY includes array is vacuously true — i.e. remove EVERY
 *      filterable non-default node.
 *    A canonicalizer that "drops falsy entries" would turn the first case
 *    into the second and render wrong art under the canonical cache key.
 */

import { filterSVG } from "../compiler/utils/filterSVG";

/**
 * Bump to invalidate every previously cached filtered SVG when the filtering
 * logic changes. Folded into the cache key like THUMB_VERSION; never part of
 * the URL.
 */
export const FILTER_VERSION = 1;

export interface ImageFilter {
  includes: unknown[];
  excludes: unknown[];
}

/** Marker for "include-based removal disabled" (a falsy include present). */
const INCLUDES_DISABLED = "off";

const normalizeEntry = (entry: unknown): unknown => {
  if (
    entry &&
    typeof entry === "object" &&
    "all" in entry &&
    Array.isArray((entry as { all: unknown[] }).all)
  ) {
    // Conjunctive group: order and duplicates within `all` don't affect the
    // lookahead regex's outcome.
    const all = dedupeAndSort((entry as { all: unknown[] }).all);
    return { all };
  }
  return entry;
};

const entryKey = (entry: unknown) => JSON.stringify(entry) ?? "undefined";

const dedupeAndSort = (entries: unknown[]): unknown[] => {
  const byKey = new Map<string, unknown>();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!byKey.has(key)) {
      byKey.set(key, entry);
    }
  }
  return Array.from(byKey.entries())
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([, entry]) => entry);
};

/**
 * Canonical, order/duplicate-insensitive serialization of an image filter, or
 * `undefined` when the filter is a NO-OP (include-removal disabled and no
 * excludes — `filterMatchesName` can never return true, so the unfiltered
 * source is already correct and no variant should exist).
 */
export const serializeImageFilterParam = (
  filter: ImageFilter,
): string | undefined => {
  const excludes = dedupeAndSort(
    (filter.excludes ?? []).filter(Boolean).map(normalizeEntry),
  );
  const rawIncludes = filter.includes ?? [];
  const includesDisabled = rawIncludes.some((entry) => !entry);
  const includes = includesDisabled
    ? INCLUDES_DISABLED
    : dedupeAndSort(rawIncludes.map(normalizeEntry));
  if (includesDisabled && excludes.length === 0) {
    return undefined;
  }
  return JSON.stringify({ i: includes, e: excludes });
};

/**
 * Inverse of `serializeImageFilterParam`: a filter object that reproduces the
 * original's `filterMatchesName` behavior. Returns `undefined` for garbage
 * (callers serve the unfiltered original).
 */
export const parseImageFilterParam = (
  param: string,
): ImageFilter | undefined => {
  try {
    const parsed = JSON.parse(param);
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    const { i, e } = parsed as { i: unknown; e: unknown };
    if (!Array.isArray(e)) {
      return undefined;
    }
    if (i === INCLUDES_DISABLED) {
      // A falsy include is how "disabled" is expressed natively.
      return { includes: [""], excludes: e };
    }
    if (!Array.isArray(i)) {
      return undefined;
    }
    return { includes: i, excludes: e };
  } catch {
    return undefined;
  }
};

const RESOURCE_PROTOCOL = "/file:/";

/**
 * Resolve a filtered image to a fetchable src WITHOUT the root's SVG source.
 *
 * Returns the on-demand filtered URL when the root is a service-worker-served
 * SVG and the filter actually does something; otherwise falls back to the
 * PLAIN root src (a no-op filter must still render the image, and a remote or
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
  const path = src.split("?")[0] ?? "";
  const isSvg =
    rootImage?.ext === "svg" || path.toLowerCase().endsWith(".svg");
  if (!isSvg || !src.startsWith(RESOURCE_PROTOCOL)) {
    return src;
  }
  const param = serializeImageFilterParam(filter);
  if (!param) {
    return src;
  }
  // Srcs are routinely stamped with `?v=<ts>` — a naive `?filters=` append
  // would hide the param from URLSearchParams entirely (silently unfiltered).
  const join = src.includes("?") ? "&" : "?";
  return `${src}${join}filters=${encodeURIComponent(param)}`;
};

/**
 * Cache key for a filtered SVG. Keyed by the file's STABLE signature
 * (path + lastModified + size), never the `?v=`-stamped request URL, plus the
 * RE-CANONICALIZED filter param and FILTER_VERSION — mirroring
 * `thumbnailCacheKey`'s discipline.
 */
export const filteredSvgCacheKey = (
  path: string,
  lastModified: number,
  size: number,
  canonicalParam: string,
) =>
  `filters=${encodeURIComponent(
    canonicalParam,
  )}&sig=${lastModified}-${size}&fv=${FILTER_VERSION}`;

/** The subset of Cache Storage this needs, so callers can pass a fake. */
export interface FilteredSvgCache {
  match(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
  delete(key: string): Promise<boolean>;
  keys(): Promise<{ url: string }[]>;
}

/** A file to filter: its bytes plus the identity its cache key needs. */
export interface FilteredSvgFile extends Blob {
  lastModified: number;
}

/**
 * Cached-or-freshly-filtered SVG response for one file, or `undefined` if the
 * param is garbage or a no-op (caller serves the unfiltered original).
 *
 * On a fresh generation, entries for the SAME path+filters at an OLDER file
 * signature are pruned — variants accumulate per edit otherwise and nothing
 * else ever deletes them (the activate sweep deliberately keeps this bucket).
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
  // Re-canonicalize so every URL spelling of the same filter shares one cache
  // entry (and a no-op filter falls through to the unfiltered original).
  const canonical = serializeImageFilterParam(filter);
  if (!canonical) {
    return undefined;
  }
  const variantPrefix = `${keyPrefix}${path}?filters=${encodeURIComponent(
    canonical,
  )}&sig=`;
  const key = `${keyPrefix}${path}?${filteredSvgCacheKey(
    path,
    file.lastModified,
    file.size,
    canonical,
  )}`;
  try {
    const cached = await cache.match(key);
    if (cached) {
      return cached;
    }
    const filtered = filterSVG(await file.text(), filter);
    const response = new Response(filtered, {
      status: 200,
      headers: new Headers({
        "Content-Type": "image/svg+xml",
        "Cache-Control": "max-age=31536000, immutable",
      }),
    });
    // Prune superseded signatures of this exact variant before storing.
    const existing = await cache.keys();
    await Promise.all(
      existing
        .filter((req) => req.url.includes(variantPrefix) && !req.url.endsWith(key))
        .map((req) => cache.delete(req.url)),
    );
    await cache.put(key, response.clone());
    return response;
  } catch {
    return undefined;
  }
};
