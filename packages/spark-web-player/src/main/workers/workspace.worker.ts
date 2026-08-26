import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";
import { RouteSearchLog } from "./RouteSearchLog";

const connection = new Port2MessageConnection((message: any, transfer) =>
  self.postMessage(message, { transfer }),
);
connection.profile("player");
connection.listen();

const compilerState = installSparkdownWorker(connection);
const gameState = installGameWorker(connection);

// P5: the PLAYER's compiler seeds the builtins prelude into the runtime story VM
// (source-injection), so the engine can source `define` context from the live
// `__def` tables (runtime inheritance: authored `as animation` inherits the
// builtin `timing`, etc.). This is the player's OWN compiler instance — the
// editor's LSP diagnostics compiler is separate and stays unseeded, so keystroke
// latency is unaffected. configure() merges, so later editor configures (files,
// startFrom, …) leave these flags set.
//
// experimentalDisplayCalls makes this the compiler that renders: SIMPLE display
// statements lower to native `display(<table>)` Luau calls (the structured
// transport every DOM/UI golden runs; `displayCallParity` proves the emitted
// ui/* stream byte-identical to the legacy routing-tag form). Setting it here
// covers every host that embeds the player — impower-dev, the vscode webview
// and the standalone player app.
compilerState.compiler.configure({
  seedBuiltinsIntoStory: true,
  experimentalDisplayCalls: true,
});

// The record of what the last route search established, and the rule for when
// that is safe to reuse. See RouteSearchLog for why neither a checkpoint's
// existence nor the checkpoint store's newest entry is evidence on its own.
const routeSearches = new RouteSearchLog();

/** Plan a route to `toPath` and replay it, recording what the search
 *  established. Returns the checkpoint it produced, if any. */
const searchRouteTo = (game: Game, toPath: string) => {
  const profilerId = compilerState.compiler.profilerId;
  profile("start", profilerId + " " + "game/planRoute");
  const fromPath = Game.getSimulateFromPath(toPath);
  const newRoute = Game.planRoute(
    game.story,
    game.program,
    fromPath,
    toPath,
    compilerState.compiler.config.simulationOptions,
  );
  profile("end", profilerId + " " + "game/planRoute");
  if (!newRoute) {
    // No route to this start point exists at all — a definite answer, and the
    // one most worth passing on: a client that repeats this search pays the
    // same (unbounded until the work ceiling) cost to reach the same verdict.
    routeSearches.record({ path: toPath, reachedTarget: false });
    return undefined;
  }
  profile("start", profilerId + " " + "game/simulateRoute");
  const checkpoint = game.patchAndSimulateRoute(newRoute);
  profile("end", profilerId + " " + "game/simulateRoute");
  routeSearches.record({
    path: toPath,
    reachedTarget: game.simulation === "success",
    checkpoint: checkpoint ?? undefined,
  });
  if (checkpoint) {
    // Cache favored conditions and choices
    const conditions = game.runtimeState.conditionsEncountered;
    const choices = game.runtimeState.choicesEncountered;
    const favoredConditions = conditions.map((c) => c.selected);
    const favoredChoices = choices.map((c) => c.selected);
    compilerState.compiler.config.simulationOptions ??= {};
    compilerState.compiler.config.simulationOptions[newRoute.fromPath] = {
      favoredConditions,
      favoredChoices,
    };
  }
  return checkpoint ?? undefined;
};

compilerState.compiler.addEventListener("compiler/didCompile", (params) => {
  // Whatever the last search established was established against the OLD
  // program and the story it was compiled from. Neither survives this compile,
  // so nothing from before it may be reported for the new one.
  routeSearches.forget();
  // Create or update game
  if (!gameState.game) {
    profile("start", compilerState.compiler.profilerId + " " + "game/create");
    gameState.game = new Game({
      program: params.program,
      story: params.story,
      ...gameState.systemConfiguration,
      // This is the live-preview / HMR route-simulation game: it saves a
      // checkpoint at every beat while replaying to the edited line, which is
      // the O(n^2) cost incremental checkpoints exist to remove. Deltas store
      // periodic full keyframes + per-beat deltas; `verifyCheckpoints: false`
      // drops the per-beat full-save self-check so capture is bounded per beat
      // (the full time win). The delta reconstruction is covered by the
      // byte-identical round-trip tests (incl. the pure-delta path); flip verify
      // back on if a regression ever needs the self-check's fall-back-to-full.
      incrementalCheckpoints: true,
      verifyCheckpoints: false,
    });
    profile("end", compilerState.compiler.profilerId + " " + "game/create");
  } else {
    profile("start", compilerState.compiler.profilerId + " " + "game/update");
    gameState.game.updateProgram(params.program, params.story);
    profile("end", compilerState.compiler.profilerId + " " + "game/update");
  }

  // Plan and simulate route
  if (params.program.startFrom) {
    profile(
      "start",
      compilerState.compiler.profilerId + " " + "game/setStartFrom",
    );
    gameState.game.setStartFrom(params.program.startFrom);
    profile(
      "end",
      compilerState.compiler.profilerId + " " + "game/setStartFrom",
    );
    const toPath = gameState.game.startPath;
    if (toPath) {
      searchRouteTo(gameState.game, toPath);
      // Augment with the simulated checkpoint, and with what the search
      // established about this start point.
      routeSearches.report(params, toPath);
    }
  }
});

compilerState.compiler.addEventListener("compiler/didRemove", (params) => {
  if (
    compilerState.compiler.config.startFrom?.file === params.textDocument.uri
  ) {
    compilerState.compiler.config.startFrom = undefined;
  }
});

compilerState.compiler.addEventListener("compiler/didSelect", (params) => {
  // Plan and simulate route
  if (gameState.game) {
    const newStartFrom = {
      file: params.textDocument.uri,
      line: params.selectedRange.start.line,
    };
    compilerState.compiler.config.startFrom = newStartFrom;
    if (
      newStartFrom.file !== gameState.game.startFrom?.file ||
      newStartFrom.line !== gameState.game.startFrom?.line
    ) {
      profile(
        "start",
        compilerState.compiler.profilerId + " " + "game/setStartFrom",
      );
      gameState.game.setStartFrom(newStartFrom);
      profile(
        "end",
        compilerState.compiler.profilerId + " " + "game/setStartFrom",
      );
      const toPath = gameState.game.startPath;
      if (toPath) {
        searchRouteTo(gameState.game, toPath);
        // Augment with the simulated checkpoint, and with what the search
        // established about this start point.
        routeSearches.report(params, toPath);
      }
    } else {
      // The start point did not move (the editor re-selects on every cursor
      // change, including one that only moves the column), so the search
      // already run for it still describes this selection — but only if it was
      // run for THIS path. Nothing else here may be reused: the newest
      // checkpoint in the store belongs to the last route that was replayed,
      // which is a different line whenever the search since then found no route.
      routeSearches.report(params, gameState.game.startPath);
    }
  }
});

export default "";
