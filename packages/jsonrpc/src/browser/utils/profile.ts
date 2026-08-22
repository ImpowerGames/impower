// The one profiler implementation. Every other `profile()` helper in the repo
// is a thin wrapper over `profilePhase`, so there is a single place for this to
// be right — the leak this fixes existed in five independent copies.
//
// User-timing entries have no buffer cap — unlike resource timing, which the
// platform evicts at 250 — so every mark and measure is retained by the global
// `performance` object for the life of the realm. A long-lived realm (compiler
// worker, player main thread, language server) therefore accumulates one mark
// per phase boundary and one measure per phase forever, and the shipped hosts
// run with profiling permanently on. So each entry is cleared as soon as it has
// been emitted.
//
// A PerformanceObserver still receives every entry: delivery happens when the
// entry is created, not when the buffer is read. What is given up is reading
// the buffer back afterwards — `window.__preview.perf("measure")` and the
// perf-report test are the only two places that do, and the latter opts out via
// `setRetainProfilerEntries`.
//
// Elapsed time is measured from a timestamp captured here, NOT by naming the
// two marks. Mark-name resolution cannot survive clearing: `measure()` binds to
// the *most recent* mark of a name and `clearMarks(name)` removes *every* mark
// of that name, so with two overlapping phases of the same name the first to
// finish would delete the second's start mark and the second's measurement
// would be lost entirely. Phase names carry no request id, and the callers
// bracket `await`s, so same-name overlap is routine — every connection handles
// concurrent requests of the same method.
//
// The timestamps reproduce the old pairing rule exactly (see `takeStart`), so
// no reported duration changes; only the retention does.
const pending = new Map<string, number[]>();

// A phase that starts and never reaches its end — an early return, a throw —
// would otherwise pin its start timestamp forever. This map is the only state
// the profiler keeps, so bound it in both directions: how many starts one name
// may have outstanding, and how many names may be tracked at all. Some names
// embed unbounded values (`lsp: onCompletionResolve ${item.label}`), so without
// the second cap a throwing resolve on distinct labels would grow the map for
// the life of the realm — a smaller version of the leak being fixed.
const MAX_PENDING_PER_NAME = 32;
const MAX_PENDING_NAMES = 256;

const pushStart = (name: string, at: number) => {
  const starts = pending.get(name);
  if (!starts) {
    if (pending.size >= MAX_PENDING_NAMES) {
      // Map iteration is insertion-ordered, so this evicts the oldest name.
      const oldest = pending.keys().next().value;
      if (oldest !== undefined) {
        pending.delete(oldest);
      }
    }
    pending.set(name, [at]);
    return;
  }
  starts.push(at);
  if (starts.length > MAX_PENDING_PER_NAME) {
    starts.shift();
  }
};

// Take the MOST RECENT outstanding start, which is exactly what resolving a
// mark name did before ("convert a mark to a timestamp" uses the last mark of
// that name). Durations are therefore unchanged by this fix.
//
// Pairing oldest-first instead looks more correct for genuinely overlapping
// phases, but it is much worse in practice: a phase that starts and never ends
// (`SparkdownWorkspace.compile` returns early on the no-change and piggyback
// paths; `SparkdownCompiler` swallows a mid-parse throw) leaves a start that
// oldest-first would hand to the *next unrelated* end, shifting every later
// measurement for that name by one, forever. Measured on a 100ms phase after
// one orphaned start and a 300ms idle: oldest-first reported 419ms then 276ms,
// newest-first reported 107ms then 107ms — the same as before this change.
const takeStart = (name: string) => {
  const starts = pending.get(name);
  if (!starts || starts.length === 0) {
    return undefined;
  }
  const at = starts.pop();
  if (starts.length === 0) {
    pending.delete(name);
  }
  return at;
};

let retainEntries = false;

// Opt out of the clearing above, for measurement harnesses that aggregate
// `getEntriesByType("measure")` retrospectively — a synchronous run never gets
// a PerformanceObserver flush, so reading the buffer back is their only option.
export const setRetainProfilerEntries = (retain: boolean) => {
  retainEntries = retain;
};

/** Bracket a named phase. `name` is the fully composed phase name. */
export const profilePhase = (mark: "start" | "end", name: string) => {
  if (mark !== "end") {
    const startMark = `${name} start`;
    performance.mark(startMark);
    if (!retainEntries) {
      performance.clearMarks(startMark);
    }
    pushStart(name, performance.now());
    return;
  }
  const end = performance.now();
  const endMark = `${name} end`;
  performance.mark(endMark);
  if (!retainEntries) {
    performance.clearMarks(endMark);
  }
  const start = takeStart(name);
  if (start === undefined) {
    // An "end" with no matching "start" — nothing to measure.
    return;
  }
  performance.measure(name, { start, end });
  if (!retainEntries) {
    performance.clearMeasures(name);
  }
};

export const profile = (
  mark: "start" | "end",
  profilerId: string | undefined,
  method: string,
) => {
  if (!profilerId) {
    return;
  }
  profilePhase(mark, `${profilerId} ${method}`);
};
