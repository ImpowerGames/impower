
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import {
  planRouteForSelection,
  type RoutableGame,
} from "../main/workers/planRouteForSelection";
import { programIdentity } from "../utils/programIdentity";

const URI = "file://proj/main.sd";

const PROGRAM = { uri: URI, scripts: { [URI]: 1 }, filesEpoch: 1 };

const ADDRESS_AT_LINE: Record<number, { first: ProgramAddress; last: ProgramAddress }> = {
  2: { first: 2, last: 2 },
  3: { first: 2, last: 2 },
  4: { first: 40, last: 42 },
  6: { first: 6, last: 6 },
  8: { first: 8, last: 8 },
};

function recordingGame() {
  const calls: string[] = [];
  const game = {
    calls,
    program: PROGRAM,
    startFrom: { file: URI, line: 2 } as { file: string; line: number },
    startAddress: ADDRESS_AT_LINE[2]!.last as ProgramAddress | null,
    setStartFrom(
      startFrom: { file: string; line: number },
      beat: "first" | "last" = "first",
    ) {
      calls.push(`setStartFrom:${startFrom.line}`);
      game.startFrom = startFrom;
      game.startAddress = ADDRESS_AT_LINE[startFrom.line]?.[beat] ?? null;
    },
  };
  return game;
}

function context(
  game: ReturnType<typeof recordingGame> | undefined,
  address: ProgramAddress = 2,
  programId = programIdentity(PROGRAM),
) {
  const remembered: { file: string; line: number }[] = [];
  const searched: ProgramAddress[] = [];
  const routeSearches = new RouteSearchLog();
  routeSearches.record({
    address,
    programId,
    reachedTarget: true,
    checkpoint: `the state at ${address}`,
  });
  return {
    remembered,
    searched,
    ctx: {
      game,
      rememberStartFrom: (startFrom: { file: string; line: number }) => {
        remembered.push(startFrom);
      },
      searchRouteTo: (g: RoutableGame, to: ProgramAddress) => {
        searched.push(to);
        routeSearches.record({
          address: to,
          programId: programIdentity(g.program),
          reachedTarget: true,
          checkpoint: `the new state at ${String(to)}`,
        });
      },
      routeSearches,
      profilerId: "test",
    },
  };
}

function selection(line: number, programOutdated?: boolean) {
  return {
    textDocument: { uri: URI },
    selectedRange: { start: { line } },
    programOutdated,
  } as Parameters<typeof planRouteForSelection>[0];
}

describe("planning a route for a selection (#489)", () => {
  test("plans none against a program the document has outrun", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);

    planRouteForSelection(selection(8, true), ctx);

    expect(searched).toEqual([]);
    expect(game.calls).toEqual([]);
    expect(game.startFrom).toEqual({ file: URI, line: 2 });
  });

  test("sends no checkpoint back with an outdated selection", () => {
    const { ctx } = context(recordingGame());
    const params = selection(2, true);

    planRouteForSelection(params, ctx);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedAddress).toBeUndefined();
  });

  test("still records the selection as where the next compile starts", () => {
    const { remembered, ctx } = context(recordingGame());

    planRouteForSelection(selection(8, true), ctx);

    expect(remembered).toEqual([{ file: URI, line: 8 }]);
  });

  test("plans one when the program still describes the document", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);

    planRouteForSelection(selection(8, false), ctx);

    expect(game.calls).toEqual(["setStartFrom:8"]);
    expect(searched).toEqual([8]);
  });

  test("plans one when the compiler said nothing either way", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);

    planRouteForSelection(selection(8, undefined), ctx);

    expect(searched).toEqual([8]);
  });

  test("reuses the standing search when the start point did not move", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);
    const params = selection(2, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([]);
    expect(params.checkpoint).toBe("the state at 2");
  });

  test("reuses the standing search for another line that resolves to its address", () => {
    const { searched, ctx } = context(recordingGame());
    const params = selection(3, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([]);
    expect(params.checkpoint).toBe("the state at 2");
  });

  test("searches again when the standing search was for the line's other beat", () => {
    const game = recordingGame();
    game.setStartFrom({ file: URI, line: 4 }, "first");
    const { searched, ctx } = context(game, 40);
    const params = selection(4, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([42]);
    expect(params.checkpoint).toBe("the new state at 42");
  });

  test("searches again when the standing search ran in another program", () => {
    const other = programIdentity({ ...PROGRAM, filesEpoch: 2 });
    const { searched, ctx } = context(recordingGame(), 2, other);
    const params = selection(2, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([2]);
    expect(params.checkpoint).toBe("the new state at 2");
  });

  test("does nothing at all before a game exists", () => {
    const { remembered, searched, ctx } = context(undefined);

    planRouteForSelection(selection(8, false), ctx);

    expect(remembered).toEqual([]);
    expect(searched).toEqual([]);
  });
});
