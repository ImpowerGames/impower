import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { SimulationFailure } from "@impower/sparkdown/src/compiler/types/SimulationFailure";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";

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

/**
 * The verdict on the most recent attempt to simulate a preview route.
 *
 * A selection that does not move the cursor reuses the last checkpoint rather
 * than searching again, so when there is no checkpoint to reuse the only honest
 * answer is the one the last real attempt reached. Kept here rather than read
 * back off the game, because the game only ever learns about the failures it
 * caused itself — a route that could not be PLANNED never reaches it.
 */
let lastSimulationFailure: SimulationFailure | undefined;

/**
 * Plan a route to wherever the game's start path currently points, replay it,
 * and hand the caller's message either the checkpoint that came out or the
 * reason none did.
 *
 * The player shows its status row as failed whenever it is handed no
 * checkpoint, and until now that was all it could say. Reporting the reason
 * from here is what lets it explain itself: this is where the attempt is made,
 * and by the time the player notices the absence, every distinguishing detail
 * is gone.
 */
const simulatePreviewRoute = (
  game: Game,
  params: { checkpoint?: string; simulationFailure?: SimulationFailure },
) => {
  const record = (failure: SimulationFailure | undefined) => {
    lastSimulationFailure = failure;
    params.simulationFailure = failure;
  };
  if (!game.startPath) {
    // The line the author is previewing from is not part of the story flow, so
    // there is no route to look for.
    record("unroutable");
    return;
  }
  profile("start", compilerState.compiler.profilerId + " " + "game/planRoute");
  const toPath = game.startPath;
  const fromPath = Game.getSimulateFromPath(toPath);
  const newRoute = Game.planRoute(
    game.story,
    game.program,
    fromPath,
    toPath,
    compilerState.compiler.config.simulationOptions,
  );
  profile("end", compilerState.compiler.profilerId + " " + "game/planRoute");
  if (!newRoute) {
    // Asked immediately after the search that failed: the planner's account of
    // how it ended is what decides between "gave up" and "no way there".
    record(Game.describeFailedRouteSearch(game.program, toPath));
    return;
  }
  profile(
    "start",
    compilerState.compiler.profilerId + " " + "game/simulateRoute",
  );
  const checkpoint = game.patchAndSimulateRoute(newRoute);
  profile("end", compilerState.compiler.profilerId + " " + "game/simulateRoute");
  if (!checkpoint) {
    // A route existed but replaying it produced nothing to restore from.
    record(game.simulationFailure ?? "diverged");
    return;
  }
  // Augment with simulated checkpoint
  params.checkpoint = checkpoint;
  record(undefined);
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
};

compilerState.compiler.addEventListener("compiler/didCompile", (params) => {
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
    simulatePreviewRoute(gameState.game, params);
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
      simulatePreviewRoute(gameState.game, params);
    } else {
      // Augment with last simulated checkpoint
      const lastCheckpoint = gameState.game.checkpoints.at(-1);
      if (lastCheckpoint) {
        params.checkpoint = lastCheckpoint;
      } else {
        // The cursor has not moved, so no fresh search ran and the verdict from
        // the last one that did still stands.
        params.simulationFailure = lastSimulationFailure;
      }
    }
  }
});

export default "";
