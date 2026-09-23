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
import { programIdentity } from "../utils/programIdentity";

const URI = "file://proj/main.sd";

/** The last compiled program, which the game holds. */
const PROGRAM = { uri: URI, scripts: { [URI]: 1 }, filesEpoch: 1 };

/** Where each line of the fixture script resolves to, as the real game's
 *  `findClosestPath` would resolve it: its first beat, and its last. Line 3
 *  is blank and resolves to line 2's path; line 4 holds three beats that a
 *  `>` breaks. */
const PATH_AT_LINE: Record<number, { first: string; last: string }> = {
  2: { first: "main.2", last: "main.2" },
  3: { first: "main.2", last: "main.2" },
  4: { first: "main.4.0", last: "main.4.2" },
  6: { first: "main.6", last: "main.6" },
  8: { first: "main.8", last: "main.8" },
};

/** A game that records what was asked of it, standing where the worker's real
 *  one stands: on the last compiled program. Its start path follows its start
 *  point, as the real game's does, so a route search that read the path before
 *  the point was moved would read the previous line's. */
function recordingGame() {
  const calls: string[] = [];
  const game = {
    calls,
    program: PROGRAM,
    startFrom: { file: URI, line: 2 } as { file: string; line: number },
    startPath: PATH_AT_LINE[2]!.last as string | null,
    setStartFrom(
      startFrom: { file: string; line: number },
      beat: "first" | "last" = "first",
    ) {
      calls.push(`setStartFrom:${startFrom.line}`);
      game.startFrom = startFrom;
      game.startPath = PATH_AT_LINE[startFrom.line]?.[beat] ?? null;
    },
  };
  return game;
}

/** A context whose last route search was run for `path` in the program
 *  `programId` names: by default the search for line 2, in the program the
 *  game holds. */
function context(
  game: ReturnType<typeof recordingGame> | undefined,
  path = "main.2",
  programId = programIdentity(PROGRAM),
) {
  const remembered: { file: string; line: number }[] = [];
  const searched: string[] = [];
  const routeSearches = new RouteSearchLog();
  routeSearches.record({
    path,
    programId,
    reachedTarget: true,
    checkpoint: `the state at ${path}`,
  });
  return {
    remembered,
    searched,
    ctx: {
      game,
      rememberStartFrom: (startFrom: { file: string; line: number }) => {
        remembered.push(startFrom);
      },
      // Records what it established, as the real search does.
      searchRouteTo: (g: RoutableGame, toPath: string) => {
        searched.push(toPath);
        routeSearches.record({
          path: toPath,
          programId: programIdentity(g.program),
          reachedTarget: true,
          checkpoint: `the new state at ${toPath}`,
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

  test("reuses the standing search for another line that resolves to its path", () => {
    // A blank line previews the line before it, and the search for that
    // line's path already describes it.
    const { searched, ctx } = context(recordingGame());
    const params = selection(3, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual([]);
    expect(params.checkpoint).toBe("the state at main.2");
  });

  test("searches again when the standing search was for the line's other beat", () => {
    // PLAY from a line that `>` breaks routes to its first beat, and the
    // preview of the same line shows its last (#721): the line did not move,
    // but the path did.
    const game = recordingGame();
    game.setStartFrom({ file: URI, line: 4 }, "first");
    const { searched, ctx } = context(game, "main.4.0");
    const params = selection(4, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual(["main.4.2"]);
    expect(params.checkpoint).toBe("the new state at main.4.2");
  });

  test("searches again when the standing search ran in another program", () => {
    // A path string survives edits that change what the story does at it, so
    // a search is evidence only about the program it ran in.
    const other = programIdentity({ ...PROGRAM, filesEpoch: 2 });
    const { searched, ctx } = context(recordingGame(), "main.2", other);
    const params = selection(2, false);

    planRouteForSelection(params, ctx);

    expect(searched).toEqual(["main.2"]);
    expect(params.checkpoint).toBe("the new state at main.2");
  });

  test("does nothing at all before a game exists", () => {
    const { remembered, searched, ctx } = context(undefined);

    planRouteForSelection(selection(8, false), ctx);

    expect(remembered).toEqual([]);
    expect(searched).toEqual([]);
  });
});
