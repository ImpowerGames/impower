import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";

const compilerState = installSparkdownWorker();
const gameState = installGameWorker();

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
        toPath
        // TODO: params.program.simulateChoices
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
        }
      }
    }
  }
});

compilerState.compiler.addEventListener("compiler/didSelect", (params) => {
  const { userEvent, docChanged } = params;
  if (userEvent && !docChanged) {
    // Plan and simulate route
    if (gameState.game) {
      const newStartFrom = {
        file: params.textDocument.uri,
        line: params.selectedRange.start.line,
      };
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
            toPath
            // TODO: params.program.simulateChoices
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
            }
          }
        }
      }
    }
  }
});

export default "";
