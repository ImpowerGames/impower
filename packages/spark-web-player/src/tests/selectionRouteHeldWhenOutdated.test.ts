// The second half of the #489 fix, which the player's own guard does not
// cover: the workspace worker plans and replays a story route to the selected
// line, against the game holding the last compiled program. Run against a
// program the document has outrun, that replay reaches whatever used to stand
// at the line — and it caches that route's favored conditions and choices into
// the compiler config, which the NEXT compile starts its own search from. So a
// stale search does not merely waste work; it biases the compile that is meant
// to correct it.
//
// Deleting the guard leaves the player's own tests passing, because the player
// suppresses the preview either way. These are the tests that notice.

import { describe, expect, test } from "vitest";
import { RouteSearchLog } from "../main/workers/RouteSearchLog";
import {
  planRouteForSelection,
  type RoutableGame,
} from "../main/workers/planRouteForSelection";

const URI = "file://proj/main.sd";

/** Where each line of the fixture script resolves to, as the real game's
 *  `findClosestPath` would resolve it. */
const PATH_AT_LINE: Record<number, string> = {
  2: "main.2",
  6: "main.6",
  8: "main.8",
};

/** A game that records what was asked of it, standing where the worker's real
 *  one stands: on the last compiled program. Its start path follows its start
 *  point, as the real game's does, so a route search that read the path before
 *  the point was moved would read the previous line's. */
function recordingGame() {
  const calls: string[] = [];
  const game = {
    calls,
    startFrom: { file: URI, line: 2 } as { file: string; line: number },
    startPath: PATH_AT_LINE[2] as string | null,
    setStartFrom(startFrom: { file: string; line: number }) {
      calls.push(`setStartFrom:${startFrom.line}`);
      game.startFrom = startFrom;
      game.startPath = PATH_AT_LINE[startFrom.line] ?? null;
    },
  };
  return game;
}

function context(game: ReturnType<typeof recordingGame> | undefined) {
  const remembered: { file: string; line: number }[] = [];
  const searched: string[] = [];
  const routeSearches = new RouteSearchLog();
  routeSearches.record({
    path: "main.2",
    reachedTarget: true,
    checkpoint: "the state at main.2",
  });
  return {
    remembered,
    searched,
    ctx: {
      game,
      rememberStartFrom: (startFrom: { file: string; line: number }) => {
        remembered.push(startFrom);
      },
      searchRouteTo: (_g: RoutableGame, toPath: string) => {
        searched.push(toPath);
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
    // The game's own start point is left where it was, so nothing downstream
    // reads a path resolved in the outdated program either.
    expect(game.calls).toEqual([]);
    expect(game.startFrom).toEqual({ file: URI, line: 2 });
  });

  test("sends no checkpoint back with an outdated selection", () => {
    // The checkpoint is a story state the player loads wholesale. One replayed
    // in the pre-edit program puts the preview at the wrong beat even after the
    // fresh program has arrived.
    const { ctx } = context(recordingGame());
    const params = selection(2, true);

    planRouteForSelection(params, ctx);

    expect(params.checkpoint).toBeUndefined();
    expect(params.simulatedPath).toBeUndefined();
  });

  test("still records the selection as where the next compile starts", () => {
    // Without this the held selection would be lost: the compile the edit
    // scheduled would start from wherever it started before, and the line the
    // author actually clicked would never be previewed.
    const { remembered, ctx } = context(recordingGame());

    planRouteForSelection(selection(8, true), ctx);

    expect(remembered).toEqual([{ file: URI, line: 8 }]);
  });

  test("plans one when the program still describes the document", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);

    planRouteForSelection(selection(8, false), ctx);

    expect(game.calls).toEqual(["setStartFrom:8"]);
    expect(searched).toEqual(["main.8"]);
  });

  test("plans one when the compiler said nothing either way", () => {
    const game = recordingGame();
    const { searched, ctx } = context(game);

    planRouteForSelection(selection(8, undefined), ctx);

    expect(searched).toEqual(["main.8"]);
  });

  test("reuses the standing search when the start point did not move", () => {
    // The editor re-selects on every cursor move, including one that only
    // changes the column, and the search already run for that path still
    // describes it.
    const game = recordingGame();
    const { searched, ctx } = context(game);
    const params = selection(2, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([]);
    expect(params.checkpoint).toBe("the state at main.2");
  });

  test("does nothing at all before a game exists", () => {
    const { remembered, searched, ctx } = context(undefined);

    planRouteForSelection(selection(8, false), ctx);

    expect(remembered).toEqual([]);
    expect(searched).toEqual([]);
  });
});
