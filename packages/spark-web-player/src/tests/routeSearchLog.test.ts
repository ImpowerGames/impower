import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";

describe("reporting why a route search did not get there (#379)", () => {
  test("a replay that fell short reports its reason even though it names no address", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: false,
      checkpoint: "STATE_PARTWAY_ALONG",
      simulationFailure: "diverged",
    });

    const params: {
      checkpoint?: string;
      simulatedAddress?: ProgramAddress | null;
      simulationFailure?: SimulationFailure;
    } = {};
    log.report(params, 3);

    expect(params.simulatedAddress).toBeUndefined();
    expect(params.simulationFailure).toBe("diverged");
  });

  test("a search that found no route reports both the verdict and the reason", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: false,
      simulationFailure: "exhausted",
    });

    const params: {
      checkpoint?: string;
      simulatedAddress?: ProgramAddress | null;
      simulationFailure?: SimulationFailure;
    } = {};
    log.report(params, 3);

    expect(params.simulatedAddress).toBe(3);
    expect(params.simulationFailure).toBe("exhausted");
  });

  test("a search that got there reports no reason at all", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: true,
      checkpoint: "STATE_AT_MAIN_3",
    });

    const params: {
      checkpoint?: string;
      simulationFailure?: SimulationFailure;
    } = {};
    log.report(params, 3);

    expect(params.simulationFailure).toBeUndefined();
  });

  test("a reason recorded for another address is not reported for this one", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 9,
      programId: "PROGRAM_V7",
      reachedTarget: false,
      simulationFailure: "timeout",
    });

    const params: { simulationFailure?: SimulationFailure } = {};
    log.report(params, 3);

    expect(params.simulationFailure).toBeUndefined();
  });
});

describe("reporting what a route search established", () => {
  test("a replay that reached its target reports the address and the state there", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: true,
      checkpoint: "STATE_AT_MAIN_3",
    });

    const params: {
      checkpoint?: string;
      simulatedAddress?: ProgramAddress | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBe("STATE_AT_MAIN_3");
    expect(params.simulatedAddress).toBe(3);
    expect(params.simulatedProgramId).toBe("PROGRAM_V7");
  });

  test("the program identity never travels without the address", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: false,
      checkpoint: "STATE_PARTWAY_ALONG",
    });

    const params: {
      checkpoint?: string;
      simulatedAddress?: ProgramAddress | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, 3);

    expect(params.simulatedAddress).toBeUndefined();
    expect(params.simulatedProgramId).toBeUndefined();
  });

  test("no route at all reports the address with no state, which is a real answer", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      programId: "PROGRAM_V7",
      reachedTarget: false,
    });

    const params: {
      checkpoint?: string;
      simulatedAddress?: ProgramAddress | null;
      simulatedProgramId?: string;
    } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBe(3);
    expect(params.simulatedProgramId).toBe("PROGRAM_V7");
  });

  test("a replay that fell short passes on its state but claims nothing", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      reachedTarget: false,
      checkpoint: "STATE_PARTWAY_ALONG",
    });

    const params: { checkpoint?: string; simulatedAddress?: ProgramAddress | null } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBe("STATE_PARTWAY_ALONG");
    expect(params.simulatedAddress).toBeUndefined();
  });

  test("nothing is said about an address that was not the one searched for", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      reachedTarget: true,
      checkpoint: "STATE_AT_MAIN_3",
    });
    log.record({ address: 9, reachedTarget: false });

    const params: { checkpoint?: string; simulatedAddress?: ProgramAddress | null } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBeUndefined();
  });

  test("nothing is said when no search has been run", () => {
    const log = new RouteSearchLog();

    const params: { checkpoint?: string; simulatedAddress?: ProgramAddress | null } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBeUndefined();
  });

  test("a recompile drops what the previous program's search established", () => {
    const log = new RouteSearchLog();
    log.record({
      address: 3,
      reachedTarget: true,
      checkpoint: "STATE_FROM_THE_OLD_PROGRAM",
    });
    log.forget();

    const params: { checkpoint?: string; simulatedAddress?: ProgramAddress | null } = {};
    log.report(params, 3);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBeUndefined();
    expect(log.last).toBeNull();
  });

  test("an undefined start address matches nothing", () => {
    const log = new RouteSearchLog();
    log.record({ address: 3, reachedTarget: true, checkpoint: "STATE" });

    const params: { checkpoint?: string; simulatedAddress?: ProgramAddress | null } = {};
    log.report(params, undefined);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBeUndefined();
  });
});
