/**
 * The slice of `HTMLImageElement` a warm-up needs, so tests can pass a fake and
 * this file stays runnable outside a DOM.
 */
export interface PreloadTarget {
  src: string;
  onload: ((this: any, ev: any) => any) | null;
  onerror: ((this: any, ev: any) => any) | null;
}

/**
 * How many warm-ups may be in flight at once.
 *
 * Not a throttle for its own sake: assets are served by a service worker that
 * reads OPFS (and, in the cross-origin player, round-trips through the editor),
 * so an unbounded burst puts every asset behind every other one. The asset the
 * user reaches first then arrives no sooner than the last — which is how
 * warming 261 images at project open still left the first portrait cold (#344).
 */
export const DEFAULT_MAX_CONCURRENT_PRELOADS = 6;

/** How many times one src may fail before the warm-up stops retrying it. */
export const MAX_PRELOAD_ATTEMPTS = 3;

/**
 * Keeps image URLs resident so the renderer paints them without a fetch.
 *
 * Keyed by SRC rather than by file uri: one asset can be requested under
 * several URLs (a filtered SVG variant is `<root>?v=<sig>&filters=<canonical>`),
 * and warming the wrong one is indistinguishable from not warming at all.
 */
export class ImagePreloader {
  protected _warmed = new Map<string, PreloadTarget>();

  /**
   * Failure counts per src, and the srcs that have given up.
   *
   * Warming re-runs whenever the program changes, so a src that cannot be
   * served (a file missing from OPFS, an offline remote asset) would otherwise
   * be re-requested forever and — being re-queued ahead of anything new —
   * permanently occupy the concurrency window. But giving up on the FIRST
   * failure is just as wrong: on a first visit the service worker may not be
   * controlling the page yet, so an early sweep can 404 across the board and
   * would strand the whole project cold for the session. Hence a small retry
   * budget rather than either extreme. `evict` clears both, since a changed
   * file says nothing about the old bytes' failures.
   */
  protected _failures = new Map<string, number>();

  protected _failed = new Set<string>();

  protected _queue: string[] = [];

  protected _queued = new Set<string>();

  protected _inFlight = 0;

  protected _pumping = false;

  protected _maxConcurrent: number;

  constructor(
    protected _createTarget: () => PreloadTarget,
    maxConcurrent: number = DEFAULT_MAX_CONCURRENT_PRELOADS,
  ) {
    // A cap of 0 (or NaN, from a `??`-defaulted config) would leave the pump
    // loop unable to start anything and the queue growing silently forever.
    this._maxConcurrent = Math.max(1, Math.floor(maxConcurrent) || 1);
  }

  get warmedCount() {
    return this._warmed.size;
  }

  get pendingCount() {
    return this._queue.length;
  }

  get inFlightCount() {
    return this._inFlight;
  }

  get failedCount() {
    return this._failed.size;
  }

  /** Requested — not necessarily finished loading. */
  isWarm(src: string) {
    return this._warmed.has(src);
  }

  warm(src: string | null | undefined) {
    // A `data:` src is already in the program — there is no fetch to get ahead
    // of, and holding a second copy of it decoded would cost memory for nothing.
    if (!src || src.startsWith("data:")) {
      return;
    }
    if (
      this._warmed.has(src) ||
      this._queued.has(src) ||
      this._failed.has(src)
    ) {
      return;
    }
    this._queued.add(src);
    this._queue.push(src);
    this._pump();
  }

  warmAll(srcs: Iterable<string | null | undefined>) {
    for (const src of srcs) {
      this.warm(src);
    }
  }

  /**
   * Warm exactly this set and forget everything else.
   *
   * Retention has to be bounded by what the CURRENT program renders, not by
   * every url ever seen: each authored filter combination mints a new variant
   * url, so a session spent trying `~happy`, `~sad`, `~angry` would otherwise
   * keep all of them decoded and resident forever, as would switching projects.
   */
  warmOnly(srcs: Iterable<string | null | undefined>) {
    const keep = new Set<string>();
    for (const src of srcs) {
      if (src) {
        keep.add(src);
      }
      this.warm(src);
    }
    for (const src of Array.from(this._warmed.keys())) {
      if (!keep.has(src)) {
        this._warmed.delete(src);
      }
    }
    for (const src of Array.from(this._failed)) {
      if (!keep.has(src)) {
        this._failed.delete(src);
      }
    }
    for (const src of Array.from(this._failures.keys())) {
      if (!keep.has(src)) {
        this._failures.delete(src);
      }
    }
    // The QUEUE too, or a switched-away project's backlog stays ahead of the
    // urls the user is about to need — which is the failure the concurrency
    // cap exists to prevent, just relocated.
    this._queue = this._queue.filter((src) => {
      if (keep.has(src)) {
        return true;
      }
      this._queued.delete(src);
      return false;
    });
  }

  /**
   * Forget every warmed URL of one asset.
   *
   * Pass any src belonging to the asset: srcs are stamped `?v=<mtime>-<size>`
   * and variants add more query params, so the path before `?` is what
   * identifies the file. Editing it mints new URLs and strands the old ones,
   * which would otherwise be retained decoded forever.
   */
  evict(src: string | null | undefined) {
    if (!src) {
      return;
    }
    const path = src.split("?")[0];
    const matches = (candidate: string) => candidate.split("?")[0] === path;
    for (const key of Array.from(this._warmed.keys())) {
      if (matches(key)) {
        this._warmed.delete(key);
      }
    }
    // The file changed, so a previous failure says nothing about the new bytes.
    for (const key of Array.from(this._failed)) {
      if (matches(key)) {
        this._failed.delete(key);
      }
    }
    for (const key of Array.from(this._failures.keys())) {
      if (matches(key)) {
        this._failures.delete(key);
      }
    }
    this._queue = this._queue.filter((queuedSrc) => {
      if (matches(queuedSrc)) {
        this._queued.delete(queuedSrc);
        return false;
      }
      return true;
    });
  }

  protected _recordFailure(src: string) {
    const failures = (this._failures.get(src) ?? 0) + 1;
    this._failures.set(src, failures);
    if (failures >= MAX_PRELOAD_ATTEMPTS) {
      this._failed.add(src);
    }
  }

  protected _pump() {
    // A target that resolves synchronously (a fake in tests, a same-tick cache
    // hit) calls back into _pump from inside this loop; the guard keeps that
    // from recursing, and the loop below re-checks _inFlight anyway.
    if (this._pumping) {
      return;
    }
    this._pumping = true;
    try {
      while (this._inFlight < this._maxConcurrent) {
        const src = this._queue.shift();
        if (src === undefined) {
          return;
        }
        this._queued.delete(src);
        this._inFlight += 1;
        let settled = false;
        const done = () => {
          if (settled) {
            return;
          }
          settled = true;
          this._inFlight -= 1;
          this._pump();
        };
        try {
          const target = this._createTarget();
          this._warmed.set(src, target);
          target.onload = done;
          target.onerror = () => {
            // Only if the entry is still THIS target's: an `evict` between
            // warms can leave an older, doomed request running alongside a
            // newer, good one, and a blind delete would drop the good one —
            // un-warming a url that is genuinely resident.
            if (this._warmed.get(src) === target) {
              this._warmed.delete(src);
              this._recordFailure(src);
            }
            done();
          };
          // Assigned LAST so the handlers are attached before the load starts.
          target.src = src;
        } catch {
          // Creating or arming the target threw. Release the slot, or the cap
          // fills with phantoms and the pump never starts anything again.
          this._warmed.delete(src);
          this._recordFailure(src);
          done();
        }
      }
    } finally {
      this._pumping = false;
    }
  }
}
