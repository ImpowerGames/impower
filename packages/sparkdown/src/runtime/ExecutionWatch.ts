export const EXECUTION_WATCH_STEPS = 1_024;

export type WatchedStory = object;

export const executionWatch: {
  listener: ((story: WatchedStory) => void) | null;
} = { listener: null };
