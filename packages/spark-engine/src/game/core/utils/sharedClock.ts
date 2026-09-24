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
 * short enough that a click to advance still feels immediate: #676 caps it at
 * 20 ms, so a click reaches the screen well inside a tenth of a second.
 *
 * The page can start a sound no earlier than its audio context's
 * `currentTime`, which runs the context's `baseLatency` (10 ms in the
 * development player) ahead of the time a stamp maps to, so a message has the
 * lead less that to arrive. From the player's worker, a beat's messages
 * reach the idle page in at most 4 ms, where 15 ms still left one beat in a
 * hundred late and 20 ms none; on a page whose main thread is busy for 10 ms
 * of every frame, 15 ms left 92 in a hundred late and 20 ms 59 (#811).
 */
export const BEAT_LEAD_MS = 20;
