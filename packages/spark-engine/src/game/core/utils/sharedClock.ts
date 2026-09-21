/**
 * The clock the engine and the page share, in milliseconds.
 *
 * Every thread's `performance.now()` counts from its own `timeOrigin`, so a
 * reading taken in a worker means nothing on the page. Their sum is the same
 * instant on every thread of the page, which is what a time carried in a
 * message needs.
 */
export const sharedNow = (): number =>
  performance.timeOrigin + performance.now();

/**
 * How far ahead of now the engine stamps the start of a beat. Long enough for
 * the beat's messages to reach the page before the stamp in the usual case,
 * short enough that a click to advance still feels immediate.
 */
export const BEAT_LEAD_MS = 10;
