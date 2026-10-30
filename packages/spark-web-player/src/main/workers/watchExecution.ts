import type { WatchedStory } from "@impower/sparkdown/src/runtime/ExecutionWatch";

export const BUSY_NOTICE_AFTER_MS = 250;

export const BUSY_NOTICE_EVERY_MS = 250;

export function watchExecution(options: {
  now: () => number;
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
