// Monotonic counter identifying the current `ExportRuntime` pass.
//
// `ParsedObject.Error` dedups diagnostics via per-node "already had
// error/warning" state so a single parsed object emits at most one error and
// one warning per export. The incremental pipeline REUSES parsed nodes across
// compiles, so that state must be invalidated on every export or a carried
// node silently drops a diagnostic a cold compile would emit. Rather than
// walking the whole tree to clear boolean flags (a full deep traversal per
// compile), each node stores the EPOCH at which it last emitted; bumping the
// counter at the start of `Story.ExportRuntime` invalidates every stale flag
// in O(1).
let compileEpoch = 1;

export function currentCompileEpoch(): number {
  return compileEpoch;
}

export function bumpCompileEpoch(): void {
  compileEpoch++;
}
