import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";

const connection = new Port2MessageConnection((message: any, transfer) =>
  self.postMessage(message, { transfer })
);
connection.profile("player");
connection.listen();

const compilerState = installSparkdownWorker(connection);
const gameState = installGameWorker(connection);

compilerState.compiler.addEventListener("compiler/didCompile", (params) => {
  // Create or update game
  if (!gameState.game) {
    profile("start", compilerState.compiler.profilerId + " " + "game/create");
    gameState.game = new Game({
      program: params.program,
      story: params.story,
      ...gameState.systemConfiguration,
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
      compilerState.compiler.profilerId + " " + "game/setStartFrom"
    );
    gameState.game.setStartFrom(params.program.startFrom);
    profile(
      "end",
      compilerState.compiler.profilerId + " " + "game/setStartFrom"
    );
    if (gameState.game.startPath) {
      profile(
        "start",
        compilerState.compiler.profilerId + " " + "game/planRoute"
      );
      const toPath = gameState.game.startPath;
      const fromPath = Game.getSimulateFromPath(toPath);
      const newRoute = Game.planRoute(
        gameState.game.story,
        gameState.game.program,
        fromPath,
        toPath,
        compilerState.compiler.config.simulationOptions
      );
      profile(
        "end",
        compilerState.compiler.profilerId + " " + "game/planRoute"
      );
      if (newRoute) {
        profile(
          "start",
          compilerState.compiler.profilerId + " " + "game/simulateRoute"
        );
        const checkpoint = gameState.game.patchAndSimulateRoute(newRoute);
        profile(
          "end",
          compilerState.compiler.profilerId + " " + "game/simulateRoute"
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
        compilerState.compiler.profilerId + " " + "game/setStartFrom"
      );
      gameState.game.setStartFrom(newStartFrom);
      profile(
        "end",
        compilerState.compiler.profilerId + " " + "game/setStartFrom"
      );
      if (gameState.game.startPath) {
        profile(
          "start",
          compilerState.compiler.profilerId + " " + "game/planRoute"
        );
        const toPath = gameState.game.startPath;
        const fromPath = Game.getSimulateFromPath(toPath);
        const newRoute = Game.planRoute(
          gameState.game.story,
          gameState.game.program,
          fromPath,
          toPath,
          compilerState.compiler.config.simulationOptions
        );
        profile(
          "end",
          compilerState.compiler.profilerId + " " + "game/planRoute"
        );
        if (newRoute) {
          profile(
            "start",
            compilerState.compiler.profilerId + " " + "game/simulateRoute"
          );
          const checkpoint = gameState.game.patchAndSimulateRoute(newRoute);
          profile(
            "end",
            compilerState.compiler.profilerId + " " + "game/simulateRoute"
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
