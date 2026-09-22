import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import { installGameWorker } from "@impower/spark-engine/src/worker/installGameWorker";
import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerFileMessage";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import type { Story as RuntimeStory } from "@impower/sparkdown/src/inkjs/engine/Story";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";
import { programIdentity } from "../../utils/programIdentity";
import { planPreviewHint, type PreviewHintState } from "../utils/previewHint";
import { displayPreviewFrom } from "./displayPreviewFrom";
import { ConfigurePlayerWorkerMessage } from "./messages/ConfigurePlayerWorkerMessage";
import {
  DisplayPreviewMessage,
  type DisplayPreviewParams,
  type DisplayPreviewResult,
} from "./messages/DisplayPreviewMessage";
import { PreviewHintMessage } from "./messages/PreviewHintMessage";
import {
  ProgramForPlayMessage,
  type ProgramForPlayParams,
  type ProgramForPlayResult,
} from "./messages/ProgramForPlayMessage";
import { planRouteForSelection } from "./planRouteForSelection";
import { RouteSearchLog } from "./RouteSearchLog";
import { searchRouteTo } from "./searchRouteTo";

/** A program the worker's game can display, and the route to where it was
 *  last asked to start. */
interface DisplayableProgram {
  id: string;
  program: SparkProgram;
  story: RuntimeStory;
  /** The canonical program searches its routes into the log PLAY reuses and
   *  remembers their choices; a suggestion's never do. */
  canonical: boolean;
  route?: {
    startFrom: { file: string; line: number };
    path: string | null | undefined;
    log: RouteSearchLog;
  };
}

/**
 * Everything the Game Preview's worker does: the player's compiler, the game
 * that plans and replays the route to the author's line on every compile and
 * selection, and, with `workerDisplaysPreview`, the display of the stopped
 * preview from that game (`player/displayPreview`), so the page holds no
 * program and no game of its own until PLAY.
 */
export function installPlayerWorker(connection: MessageConnection) {
  const player = { workerDisplaysPreview: false };
  // The warm-up is planned before the compiler handles the selection, which
  // can recompile the real documents first, so the fetches start as soon as
  // the selection arrives. Registered before the compiler's own listener,
  // which the connection calls in the order they were added.
  let lastHint: PreviewHintState | undefined;
  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (!player.workerDisplaysPreview || !message) {
      return;
    }
    if (
      AddCompilerFileMessage.type.is(message) ||
      UpdateCompilerFileMessage.type.is(message) ||
      RemoveCompilerFileMessage.type.is(message)
    ) {
      // A changed asset has a new signature, so every url resolved for it
      // before is dead; the next selection asks for its window again.
      lastHint = undefined;
      return;
    }
    if (SelectCompilerDocumentMessage.type.is(message)) {
      sendPreviewHint(message.params);
    }
  });

  const compilerState = installSparkdownWorker(connection, {
    summarize: () => player.workerDisplaysPreview,
  });
  const gameState = installGameWorker(connection);
  const compiler = compilerState.compiler;

  // P5: the PLAYER's compiler seeds the builtins prelude into the runtime story
  // VM (source-injection), so the engine can source `define` context from the
  // live `__def` tables (runtime inheritance: authored `as animation` inherits
  // the builtin `timing`, etc.). This is the player's OWN compiler instance —
  // the editor's LSP diagnostics compiler is separate and stays unseeded, so
  // keystroke latency is unaffected. configure() merges, so later editor
  // configures (files, startFrom, …) leave these flags set.
  //
  // experimentalDisplayCalls makes this the compiler that renders: SIMPLE
  // display statements lower to native `display(<table>)` Luau calls (the
  // structured transport every DOM/UI golden runs; `displayCallParity` proves
  // the emitted ui/* stream byte-identical to the legacy routing-tag form).
  // Setting it here covers every host that embeds the player — impower-dev,
  // the vscode webview and the standalone player app.
  compiler.configure({
    seedBuiltinsIntoStory: true,
    experimentalDisplayCalls: true,
  });

  // The record of what the last route search established, and the rule for
  // when that is safe to reuse. See RouteSearchLog for why neither a
  // checkpoint's existence nor the checkpoint store's newest entry is evidence
  // on its own.
  const routeSearches = new RouteSearchLog();

  /** Plan a route to `toPath` and replay it for the real program. */
  const searchRealRouteTo = (game: Game, toPath: string) =>
    searchRouteTo(game, toPath, routeSearches, {
      config: compiler.config,
      profilerId: compiler.profilerId,
    });

  // ---- The programs the game can display ----------------------------------
  //
  // With `workerDisplaysPreview`, the page names what it wants displayed and
  // the game shows it from the story compiled for it: the last real program;
  // the two newest suggestions, since the page asks for one after the next
  // may have compiled; the suggestion the page shows, which a return to it
  // displays again without compiling; and the one displayed last, which the
  // page takes as shown once its display answers. The compiler keeps each of
  // their stories runnable across later compiles (`keepStory`).
  const displayable = new Map<string, DisplayableProgram>();
  let canonicalId: string | undefined;
  const newestSuggestionIds: string[] = [];
  let shownSuggestionId: string | undefined;
  let displayedId: string | undefined;

  const retain = (entry: DisplayableProgram) => {
    const previous = displayable.get(entry.id);
    if (previous && previous.story !== entry.story) {
      compiler.releaseStory(previous.story);
    }
    compiler.keepStory(entry.story);
    displayable.set(entry.id, entry);
  };
  const releaseUnneeded = () => {
    for (const [id, entry] of displayable) {
      if (
        id !== canonicalId &&
        !newestSuggestionIds.includes(id) &&
        id !== shownSuggestionId &&
        id !== displayedId
      ) {
        compiler.releaseStory(entry.story);
        displayable.delete(id);
      }
    }
  };

  // Counts what is done to the game outside a display: a program given to it
  // in place, which cancels whatever it was previewing, and a route replayed
  // on it, which changes the state a display under way reads. Either
  // supersedes the display, however it came: a compile, a suggestion, a
  // selection, a return to the real program, or PLAY taking the program.
  let gameTouches = 0;
  const updateGameProgram = (
    game: Game,
    program: SparkProgram,
    story: RuntimeStory,
  ) => {
    gameTouches += 1;
    profile("start", compiler.profilerId + " " + "game/update");
    game.updateProgram(program, story);
    profile("end", compiler.profilerId + " " + "game/update");
  };

  const createOrUpdateGame = (program: SparkProgram, story: RuntimeStory) => {
    const profilerId = compiler.profilerId;
    if (!gameState.game) {
      profile("start", profilerId + " " + "game/create");
      gameState.game = new Game({
        program,
        story,
        ...gameState.systemConfiguration,
        // This is the live-preview / HMR route-simulation game: it saves a
        // checkpoint at every beat while replaying to the edited line, which
        // is the O(n^2) cost incremental checkpoints exist to remove. Deltas
        // store periodic full keyframes + per-beat deltas; `verifyCheckpoints:
        // false` drops the per-beat full-save self-check so capture is bounded
        // per beat (the full time win). The delta reconstruction is covered by
        // the byte-identical round-trip tests (incl. the pure-delta path);
        // flip verify back on if a regression ever needs the self-check's
        // fall-back-to-full.
        incrementalCheckpoints: true,
        verifyCheckpoints: false,
      });
      profile("end", profilerId + " " + "game/create");
    } else if (gameState.game.program !== program) {
      // A compile that changed nothing serves the program the game already
      // holds, which needs no giving again.
      updateGameProgram(gameState.game, program, story);
    }
    return gameState.game;
  };

  compiler.addEventListener("compiler/didCompile", (params) => {
    // Whatever the last search established was established against the OLD
    // program and the story it was compiled from. Neither survives this
    // compile, so nothing from before it may be reported for the new one.
    routeSearches.forget();
    const story = params.story;
    if (!story) {
      return;
    }
    // The route below is replayed on the game.
    gameTouches += 1;
    const game = createOrUpdateGame(params.program, story);
    const entry: DisplayableProgram | undefined = player.workerDisplaysPreview
      ? {
          id: programIdentity(params.program)!,
          program: params.program,
          story,
          canonical: true,
        }
      : undefined;
    if (entry) {
      canonicalId = entry.id;
      retain(entry);
      releaseUnneeded();
    }

    // Plan and simulate route
    if (params.program.startFrom) {
      profile("start", compiler.profilerId + " " + "game/setStartFrom");
      game.setStartFrom(params.program.startFrom);
      profile("end", compiler.profilerId + " " + "game/setStartFrom");
      const toPath = game.startPath;
      if (toPath) {
        searchRealRouteTo(game, toPath);
        // Augment with the simulated checkpoint, and with what the search
        // established about this start point.
        routeSearches.report(params, toPath);
      }
      if (entry) {
        entry.route = {
          startFrom: params.program.startFrom,
          path: toPath,
          log: routeSearches,
        };
      }
    }
  });

  // A preview compile answers one autocomplete suggestion. The game takes the
  // hypothetical program so the route to the author's line is replayed in it,
  // as it is for a real edit; the compiler recompiles the real documents
  // before the next selection is routed against this game (see
  // `selectDocument`).
  compiler.addEventListener("compiler/didPreviewCompile", (params) => {
    const profilerId = compiler.profilerId;
    const story = params.story;
    if (!story) {
      return;
    }
    // The route below is replayed on the game.
    gameTouches += 1;
    const game = createOrUpdateGame(params.program, story);
    const log = new RouteSearchLog();
    profile("start", profilerId + " " + "game/setStartFrom");
    game.setStartFrom(params.startFrom);
    profile("end", profilerId + " " + "game/setStartFrom");
    const toPath = game.startPath;
    if (toPath) {
      searchRouteTo(game, toPath, log, {
        config: compiler.config,
        profilerId,
        remember: false,
      });
      log.report(params, toPath);
    }
    if (player.workerDisplaysPreview) {
      const entry: DisplayableProgram = {
        id: programIdentity(params.program)!,
        program: params.program,
        story,
        canonical: false,
        route: { startFrom: params.startFrom, path: toPath, log },
      };
      newestSuggestionIds.push(entry.id);
      if (newestSuggestionIds.length > 2) {
        newestSuggestionIds.shift();
      }
      retain(entry);
      releaseUnneeded();
    }
  });

  compiler.addEventListener("compiler/didRemove", (params) => {
    if (compiler.config.startFrom?.file === params.textDocument.uri) {
      compiler.config.startFrom = undefined;
    }
  });

  compiler.addEventListener("compiler/didSelect", (params) => {
    // The selection's route is replayed on the game.
    gameTouches += 1;
    // A selection is routed against the real program. The game can be holding
    // a suggestion it displayed again from its kept story, with no compile
    // since to give it the real one back.
    const kept = canonicalId ? displayable.get(canonicalId) : undefined;
    if (kept && gameState.game && gameState.game.program !== kept.program) {
      compiler.activateStory(kept.story);
      createOrUpdateGame(kept.program, kept.story);
    }
    planRouteForSelection(params, {
      game: gameState.game,
      rememberStartFrom: (startFrom) => {
        compiler.config.startFrom = startFrom;
      },
      searchRouteTo: searchRealRouteTo,
      routeSearches,
      profilerId: compiler.profilerId,
    });
    // The canonical program's route now starts where the selection is.
    const canonical = canonicalId ? displayable.get(canonicalId) : undefined;
    const game = gameState.game;
    if (
      canonical &&
      game?.program === canonical.program &&
      game.startFrom &&
      !params.programOutdated
    ) {
      canonical.route = {
        startFrom: { ...game.startFrom },
        path: game.startPath,
        log: routeSearches,
      };
    }
  });

  // ---- The scene warm-up --------------------------------------------------

  const sendPreviewHint = (params: {
    textDocument: { uri: string };
    selectedRange: { start: { line: number } };
  }) => {
    try {
      const canonical = canonicalId ? displayable.get(canonicalId) : undefined;
      const program = canonical?.program;
      if (!program?.sceneAssets) {
        return;
      }
      const plan = planPreviewHint(
        program,
        params.textDocument.uri,
        params.selectedRange.start.line,
        lastHint,
      );
      if (!plan) {
        return;
      }
      lastHint = plan.state;
      connection.sendNotification(PreviewHintMessage.type, {
        cursor: plan.cursor,
        near: plan.near,
        rest: plan.rest,
      });
    } catch (e) {
      // A hint is an optimization; it must never take the selection down.
      console.warn("Could not prefetch the selected scene's images:", e);
    }
  };

  // ---- The display --------------------------------------------------------

  let displays = 0;

  // Everything the game sends while it displays goes to the page. The
  // execution report names where a route that failed was simulated from and
  // was headed, which the page labels with document locations it can no
  // longer look up itself.
  const sendToPage = (message: Message, transfer?: ArrayBuffer[]) => {
    if (!isRequest(message) && !isNotification(message)) {
      return;
    }
    const program = gameState.game?.program;
    if (
      program &&
      GameExecutedMessage.type.isNotification(message) &&
      message.params.simulation === "fail"
    ) {
      const { simulatePath, startPath } = message.params;
      message = {
        ...message,
        params: {
          ...message.params,
          simulateLocation: simulatePath
            ? (Game.pathToDocumentLocation(program, simulatePath) ?? undefined)
            : undefined,
          startLocation: startPath
            ? (Game.pathToDocumentLocation(program, startPath) ?? undefined)
            : undefined,
        },
      } as Message;
    }
    connection.postMessage(message, transfer);
  };

  /** The route to `point` in `entry`: the one already replayed there, or a
   *  search now, with the game holding the entry's program. */
  const routeTo = (
    game: Game,
    entry: DisplayableProgram,
    point: { file: string; line: number },
  ) => {
    const route = entry.route;
    if (
      !route ||
      route.startFrom.file !== point.file ||
      route.startFrom.line !== point.line
    ) {
      profile("start", compiler.profilerId + " " + "game/setStartFrom");
      game.setStartFrom(point);
      profile("end", compiler.profilerId + " " + "game/setStartFrom");
      const toPath = game.startPath;
      const log = entry.canonical ? routeSearches : new RouteSearchLog();
      if (toPath) {
        if (entry.canonical) {
          searchRealRouteTo(game, toPath);
        } else {
          searchRouteTo(game, toPath, log, {
            config: compiler.config,
            profilerId: compiler.profilerId,
            remember: false,
          });
        }
      }
      entry.route = { startFrom: point, path: toPath, log };
    }
    const report: {
      checkpoint?: string;
      simulatedPath?: string | null;
      simulatedProgramId?: string;
      simulationFailure?: any;
    } = {};
    entry.route!.log.report(report, entry.route!.path);
    return report;
  };

  const display = async (
    params: DisplayPreviewParams,
  ): Promise<DisplayPreviewResult> => {
    const display = ++displays;
    if (params.keep !== undefined) {
      shownSuggestionId = params.keep;
    }
    let fresh = params.fresh === true;
    for (;;) {
      const entry = displayable.get(params.program);
      const game = gameState.game;
      if (!entry || !game) {
        return { displayed: false, missing: true };
      }
      compiler.activateStory(entry.story);
      const programChanged =
        fresh || displayedId !== entry.id || game.program !== entry.program;
      if (game.program !== entry.program) {
        updateGameProgram(game, entry.program, entry.story);
      }
      const touches = gameTouches;
      const route = routeTo(game, entry, {
        file: params.file,
        line: params.line,
      });
      displayedId = entry.id;
      const displayed = await displayPreviewFrom(game, {
        program: entry.program,
        programChanged,
        file: params.file,
        line: params.line,
        speculative: params.speculative,
        checkpoint: route.checkpoint,
        simulationFailure: route.simulationFailure,
        send: sendToPage,
        superseded: () =>
          display !== displays ||
          gameState.game !== game ||
          gameTouches !== touches,
      });
      if (
        !displayed &&
        display === displays &&
        gameState.game === game &&
        gameTouches !== touches &&
        programIdentity(game.program) === params.program
      ) {
        // Something done to the game took the display over while the game
        // still holds a program with the identity the page asked for: a
        // compile of unchanged documents, as a selection makes after a
        // suggestion, or a route replayed on it. The page has nothing newer to
        // ask for, so the display runs again, in full, from the program the
        // game now holds.
        fresh = true;
        continue;
      }
      return { displayed };
    }
  };

  /** The whole program the page names, for PLAY, with the route to where
   *  PLAY starts. Taking the program supersedes a display under way. */
  const programForPlay = (
    params: ProgramForPlayParams,
  ): ProgramForPlayResult => {
    displays += 1;
    const entry = displayable.get(params.program);
    const game = gameState.game;
    if (!entry || !game) {
      return {};
    }
    const program = compiler.emitCompiledProgramOf(entry.story, entry.program);
    if (game.program !== entry.program) {
      updateGameProgram(game, entry.program, entry.story);
    }
    const route = params.startFrom
      ? routeTo(game, entry, params.startFrom)
      : {};
    return {
      ...route,
      program: compilerState.encodeProgram({
        ...program,
        startFrom: params.startFrom,
      }),
    };
  };

  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (ConfigurePlayerWorkerMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        player.workerDisplaysPreview = message.params.workerDisplaysPreview;
        // The page reads no compiled story while the worker displays, so the
        // compiler does not serialize one; a PLAY asks for it per compile.
        compiler.configure({
          emitCompiledProgram: !player.workerDisplaysPreview,
        });
        return {};
      });
      return;
    }
    if (DisplayPreviewMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => display(message.params));
      return;
    }
    if (ProgramForPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => programForPlay(message.params));
      return;
    }
  });

  return { compilerState, gameState, player };
}
