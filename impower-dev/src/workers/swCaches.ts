/**
 * Which Cache Storage buckets an activating service worker should delete.
 *
 * Split out of `sw.ts` so it can actually be tested — a service worker module
 * can't be imported under vitest without executing its event registrations.
 *
 * The sweep exists to drop caches belonging to SUPERSEDED sw versions
 * (`cache-v1` once `cache-v2` is live). It must not touch buckets that are
 * deliberately version-independent: generated thumbnails are keyed by file
 * signature, so they stay valid across an sw update and regenerating them all
 * on every deploy would be pure waste. Getting this filter wrong doesn't break
 * correctness, which is exactly why it would go unnoticed.
 */
export const getStaleCacheNames = (
  existing: readonly string[],
  keep: readonly string[],
) => existing.filter((name) => !keep.includes(name));
