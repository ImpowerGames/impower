/** How many steps a story runs between calls to the execution watch. A power
 *  of two, so a step tests it with a mask. At the few microseconds a step
 *  takes, this is a call every few milliseconds of uninterrupted execution,
 *  and none for most beats. Kept small because a step can be much slower
 *  than that: a loop inside an interpolation slows as it runs, since every
 *  step scans the output it has left so far, and the watch is only as prompt
 *  as the calls it gets. */
export const EXECUTION_WATCH_STEPS = 1_024;

/** A story the watch is called with, which a host tells apart by identity
 *  (`ProgramStory`). */
export type WatchedStory = object;

/**
 * Where a thread that runs stories hears that one is still running. The
 * program engine (`ProgramStory`) calls the listener every
 * {@link EXECUTION_WATCH_STEPS} steps, the steps of Luau callbacks included,
 * so a host can tell a story that has run for a long time without yielding
 * from work that is not a story at all, such as a compile (#679).
 */
export const executionWatch: {
  listener: ((story: WatchedStory) => void) | null;
} = { listener: null };
