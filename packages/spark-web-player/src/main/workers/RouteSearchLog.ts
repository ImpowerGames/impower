import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";

/** What the last route search established about a start point, and the rule for
 *  when that is safe to hand to a client that will skip its own search on the
 *  strength of it.
 *
 *  This lives on its own because the rule is not obvious and getting it wrong is
 *  silent. Two things that look like evidence are not:
 *
 *    - `Game.patchAndSimulateRoute` returns the newest checkpoint at every exit,
 *      whether or not the replay reached the target. A checkpoint existing does
 *      not mean the story got where it was asked to go; it can be a state from
 *      partway along the route.
 *    - The checkpoint store is only truncated when a route is actually replayed
 *      (`Game.simulateRoute`). A search that finds NO route leaves the previous
 *      start point's checkpoints in place, so the newest one then describes a
 *      different line entirely.
 *
 *  So the path that was searched for, and whether the replay reached it, are
 *  recorded explicitly rather than inferred after the fact.
 */
export interface RouteSearchOutcome {
  /** The story path the search was for. */
  path: string;
  /** Identity of the program the search ran against, so a client can confirm it
   *  is holding the same one before reusing the result. See `programIdentity`. */
  programId?: string;
  /** Did the replay actually reach that path? */
  reachedTarget: boolean;
  /** The newest checkpoint the replay produced, if it produced one. Present
   *  does not imply `reachedTarget`. */
  checkpoint?: string;
  /** Why the search did not get there, when it did not. Kept apart from
   *  `reachedTarget` because that answers whether the result is REUSABLE, while
   *  this answers what to tell the author — and the two do not always agree: a
   *  route found but not replayed to the end is not reusable and is still worth
   *  explaining (#379). */
  simulationFailure?: SimulationFailure;
  /** The runtime errors and warnings the replay raised on its way, whether or
   *  not it reached the path; for a search that found no route, which
   *  replayed nothing, the errors that stopped it. */
  errors?: SimulationError[];
}

/** Params a route-search outcome can be reported on. Structural, so both
 *  `CompiledProgramParams` and `SelectedCompilerDocumentParams` satisfy it. */
export interface RouteSearchReportTarget {
  checkpoint?: string;
  simulatedPath?: string | null;
  simulatedProgramId?: string;
  simulationFailure?: SimulationFailure;
  simulationErrors?: SimulationError[];
}

export class RouteSearchLog {
  protected _last: RouteSearchOutcome | null = null;

  get last(): RouteSearchOutcome | null {
    return this._last;
  }

  /** Drop what was established. Whatever a search proved, it proved about the
   *  program and story it ran against; a recompile replaces both, so nothing
   *  from before one may be reported for what comes after it. */
  forget(): void {
    this._last = null;
  }

  record(outcome: RouteSearchOutcome): void {
    this._last = outcome;
  }

  /** Whether the last search was run for `path` in the program `programId`
   *  names, so that it still describes a route there. What a search was asked
   *  for is the only evidence: a point that resolves to the same path needs
   *  no second search, and a point on the same line can resolve to another
   *  path (a line that `>` breaks holds several beats). */
  holds(path: string, programId: string | undefined): boolean {
    const last = this._last;
    return last !== null && last.path === path && last.programId === programId;
  }

  /** Tell the client what is known about `startPath`.
   *
   *  The checkpoint is passed on whenever one was produced for this path — the
   *  preview has always been given it, and a state partway along the route is
   *  still the best thing to show.
   *
   *  `simulatedPath` is set only when the search is a DEFINITE answer about this
   *  path: the replay reached it, so the checkpoint is the story state there; or
   *  no route to it exists. A route that was found but whose replay fell short
   *  is neither, and saying nothing there leaves the client to run its own
   *  search — which is safe, because a route existing means that search
   *  terminates rather than running to the work ceiling.
   *
   *  The program identity travels with it, always as a pair. A client is meant
   *  to reuse the answer only while holding the same program, and it cannot tell
   *  that from the path alone — a path string survives edits that change what
   *  the story does at it.
   *
   *  The failure reason is passed on whenever there is one, under none of those
   *  conditions: it is not an answer a client reuses, it is what the status bar
   *  says to the author, and the case with the least to reuse (a route that
   *  would not replay) is one of the cases with the most to explain (#379). */
  report(
    params: RouteSearchReportTarget,
    startPath: string | null | undefined,
  ): void {
    const last = this._last;
    if (!last || last.path !== startPath) {
      return;
    }
    if (last.checkpoint) {
      params.checkpoint = last.checkpoint;
    }
    if (last.reachedTarget || !last.checkpoint) {
      params.simulatedPath = last.path;
      params.simulatedProgramId = last.programId;
    }
    params.simulationFailure = last.simulationFailure;
    // What the replay raised is the author's to see wherever the start point
    // is shown, whether the replay got there or stopped short of it.
    params.simulationErrors = last.errors ?? [];
  }
}
