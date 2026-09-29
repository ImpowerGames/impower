import type { WatchedStory } from "@impower/sparkdown/src/inkjs/engine/ExecutionWatch";

/** A stretch of story execution that has run this long without yielding is
 *  reported to the page. Well under anything the page acts on, so the page
 *  hears of a stretch long before it matters, and well over a beat or a route
 *  search on a small project, which send nothing. */
export const BUSY_NOTICE_AFTER_MS = 250;

/** How often a stretch that goes on is reported again. */
export const BUSY_NOTICE_EVERY_MS = 250;

/**
 * The execution watch's listener for the player's worker (#679): it times
 * each uninterrupted stretch of story execution and calls `notice` while one
 * goes on past {@link BUSY_NOTICE_AFTER_MS}.
 *
 * A stretch begins at the first watch call after the thread last yielded and
 * ends when it yields, which a microtask queued at its start observes: it
 * runs as soon as the synchronous run it was queued in ends, and never while
 * a loop that does not end is still running. Since the first call comes
 * `EXECUTION_WATCH_STEPS` into the stretch, a stretch is measured those
 * steps short, a few milliseconds; nothing here needs it closer.
 */
export function watchExecution(options: {
  now: () => number;
  /** Run `callback` once the thread next yields. */
  afterYield: (callback: () => void) => void;
  notice: (story: WatchedStory, busyMs: number) => void;
}): (story: WatchedStory) => void {
  let stretchStart: number | undefined;
  let lastNotice = 0;
  return (story) => {
    const now = options.now();
    if (stretchStart === undefined) {
      stretchStart = now;
      lastNotice = now;
      options.afterYield(() => {
        stretchStart = undefined;
      });
      return;
    }
    const busyMs = now - stretchStart;
    if (
      busyMs >= BUSY_NOTICE_AFTER_MS &&
      (lastNotice === stretchStart || now - lastNotice >= BUSY_NOTICE_EVERY_MS)
    ) {
      lastNotice = now;
      options.notice(story, busyMs);
    }
  };
}
