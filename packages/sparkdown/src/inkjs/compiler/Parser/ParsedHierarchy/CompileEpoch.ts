// Monotonic counter identifying the current compile's resolution.
//
// `ParsedObject.Error` dedups diagnostics via per-node "already had
// error/warning" state so a single parsed object emits at most one error and
// one warning per export. The incremental pipeline REUSES parsed nodes across
// compiles, so that state must be invalidated on every export or a carried
// node silently drops a diagnostic a cold compile would emit. Rather than
// walking the whole tree to clear boolean flags (a full deep traversal per
// compile), each node stores the EPOCH at which it last emitted; bumping the
// counter at the start of `Story.ExportRuntime` (and of each resolve of the
// program path, `ProgramResolver`) invalidates every stale flag in O(1).
let compileEpoch = 1;

export function currentCompileEpoch(): number {
  return compileEpoch;
}

export function bumpCompileEpoch(): void {
  compileEpoch++;
}

// Monotonic counter identifying the resolution a divert's resolved target
// belongs to (`Divert.targetContent`, the variable a divert jumps through).
//
// `ExportRuntime` resolves every parsed object of the story, so it moves this
// counter with the compile epoch and every carried divert finds its target
// again. The program path's resolver resolves only the statements an edit
// lowered anew or whose names read otherwise, and keeps every other
// statement's resolution as the compile that last resolved it left it, so it
// moves this counter only when it resolves the whole program (a cold resolve),
// and clears what a statement resolved before it resolves that statement
// again (`ParsedObject.ResetRuntime`).
//
// The counter is shared by every compiler in the process, and another
// compiler's resolve (a cold compile, the prelude's `ExportRuntime`) moves it
// between two compiles of the program path. So each bump takes a value no
// resolution has had, and the program path's resolver keeps the epoch its
// last cold resolve took and enters it again as each resolve starts
// (`enterResolutionEpoch`), so the diverts it kept still hold their targets.
let resolutionEpoch = 1;
let lastResolutionEpoch = 1;

export function currentResolutionEpoch(): number {
  return resolutionEpoch;
}

export function bumpResolutionEpoch(): void {
  lastResolutionEpoch += 1;
  resolutionEpoch = lastResolutionEpoch;
}

/** Makes `epoch`, one `bumpResolutionEpoch` began, the current resolution
 *  epoch again. */
export function enterResolutionEpoch(epoch: number): void {
  resolutionEpoch = epoch;
}
