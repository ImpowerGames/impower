import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
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
// startFrom, …) leave this flag set.
compilerState.compiler.configure({ seedBuiltinsIntoStory: true });

compilerState.compiler.addEventListener("compiler/didCompile", (params) => {
  // Create or update game
  if (!gameState.game) {
    profile("start", compilerState.compiler.profilerId + " " + "game/create");
    gameState.game = new Game({
      program: params.program,
      story: params.story,
      ...gameState.systemConfiguration,
      // P5: source defines from the live runtime __def tables (the program is
      // compiled with seedBuiltinsIntoStory above, so builtin defaults are in
      // the story VM). Equivalent to the static channel (golden-master byte-
      // identical) but resolves authored→builtin inheritance at runtime.
      runtimeSourcedDefines: true,
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
    if (gameState.game.startPath) {
      profile(
        "start",
        compilerState.compiler.profilerId + " " + "game/planRoute",
      );
      const toPath = gameState.game.startPath;
      const fromPath = Game.getSimulateFromPath(toPath);
      const newRoute = Game.planRoute(
        gameState.game.story,
        gameState.game.program,
        fromPath,
        toPath,
        compilerState.compiler.config.simulationOptions,
      );
      profile(
        "end",
        compilerState.compiler.profilerId + " " + "game/planRoute",
      );
      if (newRoute) {
        profile(
          "start",
          compilerState.compiler.profilerId + " " + "game/simulateRoute",
        );
        const checkpoint = gameState.game.patchAndSimulateRoute(newRoute);
        profile(
          "end",
          compilerState.compiler.profilerId + " " + "game/simulateRoute",
        );
        if (checkpoint) {
          // Augment with simulated checkpoint
          params.checkpoint = checkpoint;
          // Cache favored conditions and choices
          const conditions = gameState.game.runtimeState.conditionsEncountered;
          const choices = gameState.game.runtimeState.choicesEncountered;
          const favoredConditions = conditions.map((c) => c.selected);
          const favoredChoices = choices.map((c) => c.selected);
          compilerState.compiler.config.simulationOptions ??= {};
          compilerState.compiler.config.simulationOptions[newRoute.fromPath] = {
            favoredConditions,
            favoredChoices,
          };
        }
      }
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
      if (gameState.game.startPath) {
        profile(
          "start",
          compilerState.compiler.profilerId + " " + "game/planRoute",
        );
        const toPath = gameState.game.startPath;
        const fromPath = Game.getSimulateFromPath(toPath);
        const newRoute = Game.planRoute(
          gameState.game.story,
          gameState.game.program,
          fromPath,
          toPath,
          compilerState.compiler.config.simulationOptions,
        );
        profile(
          "end",
          compilerState.compiler.profilerId + " " + "game/planRoute",
        );
        if (newRoute) {
          profile(
            "start",
            compilerState.compiler.profilerId + " " + "game/simulateRoute",
          );
          const checkpoint = gameState.game.patchAndSimulateRoute(newRoute);
          profile(
            "end",
            compilerState.compiler.profilerId + " " + "game/simulateRoute",
          );
          if (checkpoint) {
            // Augment with simulated checkpoint
            params.checkpoint = checkpoint;
            // Cache favored conditions and choices
            const conditions =
              gameState.game.runtimeState.conditionsEncountered;
            const choices = gameState.game.runtimeState.choicesEncountered;
            const favoredConditions = conditions.map((c) => c.selected);
            const favoredChoices = choices.map((c) => c.selected);
            compilerState.compiler.config.simulationOptions ??= {};
            compilerState.compiler.config.simulationOptions[newRoute.fromPath] =
              {
                favoredConditions,
                favoredChoices,
              };
          }
        }
      }
    } else {
      // Augment with last simulated checkpoint
      const lastCheckpoint = gameState.game.checkpoints.at(-1);
      if (lastCheckpoint) {
        params.checkpoint = lastCheckpoint;
      }
    }
  }
});

export default "";
