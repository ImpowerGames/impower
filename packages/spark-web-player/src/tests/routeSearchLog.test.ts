// The rule that decides when the compiler worker's route search may be reused
// by a client that will skip its own search on the strength of it (#385).
//
// Getting this wrong is silent: the client starts the game at the wrong place
// and reports success. Two things that look like evidence are not, and each
// has a test here:
//
//   - a checkpoint exists  ≠  the replay reached the target. `Game`'s
//     `patchAndSimulateRoute` returns the newest checkpoint at every exit, and
//     checkpoints are captured every beat, so a replay that fell short still
//     produces one — a state partway along the route.
//   - the newest checkpoint  ≠  a checkpoint for the path being asked about.
//     The store is only truncated when a route is actually replayed, so a
//     search that found no route leaves the previous start point's checkpoints
//     in place.

import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";

describe("reporting what a route search established", () => {
  test("a replay that reached its target reports the path and the state there", () => {
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      programId: "PROGRAM_V7",
      reachedTarget: true,
      checkpoint: "STATE_AT_MAIN_3",
    });

    const params: {
      checkpoint?: string;
      simulatedPath?: string | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBe("STATE_AT_MAIN_3");
    expect(params.simulatedPath).toBe("main.3");
    // The identity travels with the path, always as a pair — a client is meant
    // to reuse the answer only while holding the same program.
    expect(params.simulatedProgramId).toBe("PROGRAM_V7");
  });

  test("the program identity never travels without the path", () => {
    // A replay that fell short names no path, so it must name no program
    // either: an identity on its own would let a client match on the program
    // and read the checkpoint as an answer about wherever it happens to be.
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      programId: "PROGRAM_V7",
      reachedTarget: false,
      checkpoint: "STATE_PARTWAY_ALONG",
    });

    const params: {
      checkpoint?: string;
      simulatedPath?: string | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, "main.3");

    expect(params.simulatedPath).toBeUndefined();
    expect(params.simulatedProgramId).toBeUndefined();
  });

  test("no route at all reports the path with no state, which is a real answer", () => {
    // This is the case the whole change exists for: repeating this search costs
    // the same and reaches the same verdict, so the client is told not to.
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      programId: "PROGRAM_V7",
      reachedTarget: false,
    });

    const params: {
      checkpoint?: string;
      simulatedPath?: string | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBe("main.3");
    expect(params.simulatedProgramId).toBe("PROGRAM_V7");
  });

  test("a replay that fell short passes on its state but claims nothing", () => {
    // The checkpoint is a position partway along the route, not the start
    // point. Passing it on is fine — the preview has always shown it — but
    // naming the path would tell a client it may start the game there.
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      reachedTarget: false,
      checkpoint: "STATE_PARTWAY_ALONG",
    });

    const params: { checkpoint?: string; simulatedPath?: string | null } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBe("STATE_PARTWAY_ALONG");
    expect(params.simulatedPath).toBeUndefined();
  });

  test("nothing is said about a path that was not the one searched for", () => {
    // Select a reachable line, then a line no route reaches: the second search
    // records itself but replays nothing, so the store still holds the FIRST
    // line's state. Asking about the second line must not hand that over.
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      reachedTarget: true,
      checkpoint: "STATE_AT_MAIN_3",
    });
    log.record({ path: "main.9", reachedTarget: false });

    const params: { checkpoint?: string; simulatedPath?: string | null } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBeUndefined();
  });

  test("nothing is said when no search has been run", () => {
    const log = new RouteSearchLog();

    const params: { checkpoint?: string; simulatedPath?: string | null } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBeUndefined();
  });

  test("a recompile drops what the previous program's search established", () => {
    // A search proves things about the program and story it ran against, and a
    // recompile replaces both.
    const log = new RouteSearchLog();
    log.record({
      path: "main.3",
      reachedTarget: true,
      checkpoint: "STATE_FROM_THE_OLD_PROGRAM",
    });
    log.forget();

    const params: { checkpoint?: string; simulatedPath?: string | null } = {};
    log.report(params, "main.3");

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBeUndefined();
    expect(log.last).toBeNull();
  });

  test("an undefined start path matches nothing", () => {
    const log = new RouteSearchLog();
    log.record({ path: "main.3", reachedTarget: true, checkpoint: "STATE" });

    const params: { checkpoint?: string; simulatedPath?: string | null } = {};
    log.report(params, undefined);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBeUndefined();
  });
});
