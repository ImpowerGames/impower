import { Port2MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port2MessageConnection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";
import { planRouteForSelection } from "./planRouteForSelection";
import { RouteSearchLog } from "./RouteSearchLog";
import { searchRouteTo } from "./searchRouteTo";

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
compilerState.compiler.configure({
  seedBuiltinsIntoStory: true,
});

// The record of what the last route search established, and the rule for when
// that is safe to reuse. See RouteSearchLog for why neither a checkpoint's
// existence nor the checkpoint store's newest entry is evidence on its own.
const routeSearches = new RouteSearchLog();

/** Plan a route to `toPath` and replay it for the real program. */
const searchRealRouteTo = (game: Game, toPath: string) =>
  searchRouteTo(game, toPath, routeSearches, {
    config: compilerState.compiler.config,
    profilerId: compilerState.compiler.profilerId,
  });

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
    // The route ends at the beat the preview shows: a line's last beat.
    gameState.game.setStartFrom(params.program.startFrom, "last");
    profile(
      "end",
      compilerState.compiler.profilerId + " " + "game/setStartFrom",
    );
    const toPath = gameState.game.startPath;
    if (toPath) {
      searchRealRouteTo(gameState.game, toPath);
      // Augment with the simulated checkpoint, and with what the search
      // established about this start point.
      routeSearches.report(params, toPath);
    }
  }
});

// A preview compile answers one autocomplete suggestion. The game takes the
// hypothetical program so the route to the author's line is replayed in it, as
// it is for a real edit; the compiler recompiles the real documents before the
// next selection is routed against this game (see `selectDocument`).
compilerState.compiler.addEventListener(
  "compiler/didPreviewCompile",
  (params) => {
    const profilerId = compilerState.compiler.profilerId;
    if (!gameState.game) {
      profile("start", profilerId + " " + "game/create");
      gameState.game = new Game({
        program: params.program,
        story: params.story,
        ...gameState.systemConfiguration,
        incrementalCheckpoints: true,
        verifyCheckpoints: false,
      });
      profile("end", profilerId + " " + "game/create");
    } else {
      profile("start", profilerId + " " + "game/update");
      gameState.game.updateProgram(params.program, params.story);
      profile("end", profilerId + " " + "game/update");
    }
    const game = gameState.game;
    profile("start", profilerId + " " + "game/setStartFrom");
    game.setStartFrom(params.startFrom, "last");
    profile("end", profilerId + " " + "game/setStartFrom");
    const toPath = game.startPath;
    if (toPath) {
      const log = new RouteSearchLog();
      searchRouteTo(game, toPath, log, {
        config: compilerState.compiler.config,
        profilerId,
        remember: false,
      });
      log.report(params, toPath);
    }
  },
);

compilerState.compiler.addEventListener("compiler/didRemove", (params) => {
  if (
    compilerState.compiler.config.startFrom?.file === params.textDocument.uri
  ) {
    compilerState.compiler.config.startFrom = undefined;
  }
});

compilerState.compiler.addEventListener("compiler/didSelect", (params) =>
  planRouteForSelection(params, {
    game: gameState.game,
    rememberStartFrom: (startFrom) => {
      compilerState.compiler.config.startFrom = startFrom;
    },
    searchRouteTo: searchRealRouteTo,
    routeSearches,
    profilerId: compilerState.compiler.profilerId,
  }),
);

export default "";
