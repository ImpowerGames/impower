import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { hasCompiledProgram } from "@impower/sparkdown/src/binary/programBinary";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import { GameExecutedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExecutedMessage";
import {
  installGameWorker,
  NoGameError,
} from "@impower/spark-engine/src/worker/installGameWorker";
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
import { ConnectPlayMessage } from "./messages/ConnectPlayMessage";
import {
  PlayMessage,
  type PlayParams,
  type PlayResult,
} from "./messages/PlayMessage";
import { ProgramHeldMessage } from "./messages/ProgramHeldMessage";
import { StartPlayMessage } from "./messages/StartPlayMessage";
import {
  StopPlayMessage,
  type StopPlayResult,
} from "./messages/StopPlayMessage";
import { putAtStartPoint } from "../../utils/putAtStartPoint";
import { planRouteForSelection, routeGameTo } from "./planRouteForSelection";
import { RouteSearchLog } from "./RouteSearchLog";
import { searchRouteTo } from "./searchRouteTo";

/** A program the worker's game can display, and what the route searches run
 *  in it established. */
interface DisplayableProgram {
  id: string;
  program: SparkProgram;
  story: RuntimeStory;
  /** Its own: a search run in one program says nothing about another. The
   *  newest real program's is `routeSearches`, whose searches the compiler
   *  remembers the choices of; no other program's are remembered. */
  log: RouteSearchLog;
}

/**
 * Everything the Game Preview's worker does: the player's compiler, the game
 * that plans and replays the route to the author's line on every compile and
 * selection, and, with `workerDisplaysPreview`, the display of the stopped
 * preview from that game (`player/displayPreview`) and PLAY's game, which
 * runs beside it (`player/play`), so the page holds no program and no game.
 */
export function installPlayerWorker(connection: MessageConnection) {
  const player = {
    workerDisplaysPreview: false,
    /** How PLAY's game is put at its start point, as the page's own PLAY
     *  puts its game there. */
    putAtStartPoint,
  };
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
  // configures (files, startFrom, …) leave this flag set.
  compiler.configure({
    seedBuiltinsIntoStory: true,
  });

  // The record of what the last route search in the real program the game
  // holds established, and the rule for when that is safe to reuse. See
  // RouteSearchLog for why neither a checkpoint's existence nor the checkpoint
  // store's newest entry is evidence on its own. Each program a compile gives
  // the game starts a new one.
  let routeSearches = new RouteSearchLog();

  /** Plan a route to `toPath` and replay it for the real program. */
  const searchRealRouteTo = (game: Game, toPath: string) =>
    searchRouteTo(game, toPath, routeSearches, {
      config: compiler.config,
      profilerId: compiler.profilerId,
    });

  // ---- The programs the game can display ----------------------------------
  //
  // With `workerDisplaysPreview`, the page names what it wants displayed and
  // the game shows it from the story compiled for it: every real program the
  // page can still name, which PLAY names too; the two newest suggestions,
  // since the page asks for one after the next may have compiled; the
  // suggestion the page shows, which a return to it displays again without
  // compiling; the one displayed last, which the page takes as shown once its
  // display answers; and the one the newest display asks for, from when its
  // request arrives. The compiler keeps each of their stories runnable
  // across later compiles (`keepStory`), and the story of the program the
  // game holds, which the game runs until it is given another. Whatever
  // nothing keeps is released each time that changes: after a compile, a
  // preview compile, a program the page takes, a display, PLAY, and a
  // selection that gives the game the real program back.
  const displayable = new Map<string, DisplayableProgram>();
  let canonicalId: string | undefined;
  // The real programs the page can still name, oldest first: the last it
  // named, by taking it or in a display or PLAY, and each compiled after it.
  // Their summaries reach the page in the order they compiled, so it can
  // come to hold any of those, and never again one compiled before the last
  // it named.
  const nameableRealIds: string[] = [];
  const newestSuggestionIds: string[] = [];
  let shownSuggestionId: string | undefined;
  let displayedId: string | undefined;
  let requestedId: string | undefined;

  /** The page names `id` as the real program it holds, so none compiled
   *  before it can be named again. */
  const pageHolds = (id: string | undefined) => {
    const at = id ? nameableRealIds.indexOf(id) : -1;
    if (at > 0) {
      nameableRealIds.splice(0, at);
    }
  };

  const retain = (entry: DisplayableProgram) => {
    const previous = displayable.get(entry.id);
    if (previous && previous.story !== entry.story) {
      compiler.releaseStory(previous.story);
    }
    compiler.keepStory(entry.story);
    displayable.set(entry.id, entry);
  };
  const releaseUnneeded = () => {
    const held = gameState.game?.program;
    for (const [id, entry] of displayable) {
      if (
        id !== canonicalId &&
        !nameableRealIds.includes(id) &&
        !newestSuggestionIds.includes(id) &&
        id !== shownSuggestionId &&
        id !== displayedId &&
        id !== requestedId &&
        entry.program !== held
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
      // Built with what the editor has asked of the preview's debugger so
      // far, as the page builds its own game.
      gameState.game = gameState.createGame({
        program,
        story,
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
    const story = params.story;
    if (!story) {
      // A compile that produced no story, which is one that threw, leaves the
      // game and the page with the program before it, whose searches still
      // describe it.
      return;
    }
    // Whatever the last search established was established against the OLD
    // program and the story it was compiled from, so nothing from before this
    // compile may be reported for the new one. The old log stays with the old
    // program, which the page can still ask to display until it has taken
    // this one.
    routeSearches = new RouteSearchLog();
    // The route below is replayed on the game.
    gameTouches += 1;
    const game = createOrUpdateGame(params.program, story);
    if (player.workerDisplaysPreview) {
      const entry: DisplayableProgram = {
        id: programIdentity(params.program)!,
        program: params.program,
        story,
        log: routeSearches,
      };
      canonicalId = entry.id;
      if (nameableRealIds.at(-1) !== entry.id) {
        nameableRealIds.push(entry.id);
      }
      retain(entry);
      releaseUnneeded();
    }

    // Plan and simulate route
    if (params.program.startFrom) {
      profile("start", compiler.profilerId + " " + "game/setStartFrom");
      // The route ends at the beat the preview shows: a line's last beat.
      game.setStartFrom(params.program.startFrom, "last");
      profile("end", compiler.profilerId + " " + "game/setStartFrom");
      const toPath = game.startPath;
      if (toPath) {
        searchRealRouteTo(game, toPath);
        // Augment with the simulated checkpoint, and with what the search
        // established about this start point.
        routeSearches.report(params, toPath);
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
    game.setStartFrom(params.startFrom, "last");
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
        log,
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
    // PLAY's game shares this thread, so while it runs the game above is
    // left as it is and the selection replays no route (see
    // `planRouteForSelection`).
    const running = gameState.running != null;
    if (!running) {
      // The selection's route is replayed on the game.
      gameTouches += 1;
      // A selection is routed against the real program. The game can be
      // holding a suggestion it displayed again from its kept story, with no
      // compile since to give it the real one back.
      const kept = canonicalId ? displayable.get(canonicalId) : undefined;
      if (kept && gameState.game && gameState.game.program !== kept.program) {
        compiler.activateStory(kept.story);
        createOrUpdateGame(kept.program, kept.story);
        releaseUnneeded();
      }
    }
    planRouteForSelection(params, {
      game: gameState.game,
      running,
      rememberStartFrom: (startFrom) => {
        compiler.config.startFrom = startFrom;
      },
      searchRouteTo: searchRealRouteTo,
      routeSearches,
      profilerId: compiler.profilerId,
    });
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

  /** `message` as `game` sends it to the page. The execution report names
   *  where a route that failed was simulated from and was headed, which the
   *  page labels with document locations it can no longer look up itself. */
  const withDocumentLocations = (message: Message, game: Game): Message => {
    const program = game.program;
    if (
      !program ||
      !GameExecutedMessage.type.isNotification(message) ||
      message.params.simulation !== "fail"
    ) {
      return message;
    }
    const { simulatePath, startPath } = message.params;
    return {
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
  };

  // Everything the game sends while it displays goes to the page, and
  // nothing while PLAY's game runs: the page shows that game alone, and a
  // stream from this one would supersede it there.
  const sendToPage = (message: Message, transfer?: ArrayBuffer[]) => {
    const game = gameState.game;
    if (
      !game ||
      gameState.running ||
      (!isRequest(message) && !isNotification(message))
    ) {
      return;
    }
    connection.postMessage(withDocumentLocations(message, game), transfer);
  };

  /** The route to `point`'s `beat` in `entry`, with the game holding the
   *  entry's program: the search its log already holds for that path, or one
   *  run now. */
  const routeTo = (
    game: Game,
    entry: DisplayableProgram,
    point: { file: string; line: number },
    beat: "first" | "last",
  ) => {
    const toPath = routeGameTo(
      game,
      point,
      beat,
      entry.log,
      (searched, path) =>
        searchRouteTo(searched, path, entry.log, {
          config: compiler.config,
          profilerId: compiler.profilerId,
          remember: entry.log === routeSearches,
        }),
      compiler.profilerId,
    );
    const report: {
      checkpoint?: string;
      simulatedPath?: string | null;
      simulatedProgramId?: string;
      simulationFailure?: any;
    } = {};
    entry.log.report(report, toPath);
    return report;
  };

  const display = async (
    params: DisplayPreviewParams,
  ): Promise<DisplayPreviewResult> => {
    const display = ++displays;
    requestedId = params.program;
    if (params.keep !== undefined) {
      shownSuggestionId = params.keep;
    }
    pageHolds(params.real);
    // A held arrow key sends one display per selection, and working one out
    // is a route replay, about a second of it on a long script. Let the
    // requests the page has already sent arrive before taking any of this
    // one's on: one that a newer request replaced while it waited its turn
    // answers at once, so the newest is worked out after the display under
    // way rather than after all of them (#680).
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (display !== displays) {
      return { displayed: false };
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
      const route = routeTo(
        game,
        entry,
        { file: params.file, line: params.line },
        "last",
      );
      displayedId = entry.id;
      releaseUnneeded();
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

  // ---- PLAY ---------------------------------------------------------------
  //
  // PLAY's game is built beside the game above, with its own story, which it
  // writes out from the compiled program once per PLAY: a compile re-parents
  // the runtime containers of every flow it reuses into its new story, so a
  // game that outlives compiles cannot run the compiler's. While it runs, the
  // page shows it, hears from it and debugs it, and the game above sends the
  // page nothing (`sendToPage`) and replays no route for a selection.

  /** Where PLAY's game `running` sends the page what it shows, while it
   *  is the one that runs: a game STOP ended cannot write into the next
   *  run's stream. */
  const sendFromPlay =
    (running: Game) => (message: Message, transfer?: ArrayBuffer[]) => {
      if (
        gameState.running !== running ||
        !(isRequest(message) || isNotification(message))
      ) {
        return;
      }
      connection.postMessage(withDocumentLocations(message, running), transfer);
    };

  /** Build PLAY's game for the program the page names, at the start point
   *  along the route to it. Taking the program supersedes a display under
   *  way. */
  const play = (params: PlayParams): PlayResult => {
    displays += 1;
    pageHolds(params.program);
    const entry = displayable.get(params.program);
    const game = gameState.game;
    if (!entry || !game) {
      return { built: false };
    }
    stopPlay();
    const program = compiler.emitCompiledProgramOf(entry.story, entry.program);
    if (game.program !== entry.program) {
      updateGameProgram(game, entry.program, entry.story);
    }
    // PLAY from a line starts at its first beat (#721).
    const route = params.startFrom
      ? routeTo(game, entry, params.startFrom, "first")
      : {};
    releaseUnneeded();
    profile("start", compiler.profilerId + " " + "play/create");
    // No story: the game builds its own from the program.
    const running = gameState.createGame({
      program,
      startFrom: params.startFrom,
      restarted: params.restarted,
    });
    profile("end", compiler.profilerId + " " + "play/create");
    player.putAtStartPoint(running, params.simulationOptions, {
      checkpoint: route.checkpoint,
      path: route.simulatedPath,
      programId: route.simulatedProgramId,
      failure: route.simulationFailure,
    });
    gameState.running = running;
    return { built: true, compiled: hasCompiledProgram(program) };
  };

  /** End PLAY's game, answering where it last executed. */
  const stopPlay = (): StopPlayResult => {
    const running = gameState.running;
    if (!running) {
      return { location: null };
    }
    const location = running.getLastExecutedDocumentLocation();
    gameState.running = undefined;
    running.destroy();
    return { location };
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
    if (PlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => play(message.params));
      return;
    }
    if (ConnectPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, async () => {
        const running = gameState.running;
        if (!running) {
          throw new NoGameError();
        }
        await running.connect(sendFromPlay(running));
        return {};
      });
      return;
    }
    if (StartPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const running = gameState.running;
        if (!running) {
          throw new NoGameError();
        }
        running.start();
        return {};
      });
      return;
    }
    if (StopPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => stopPlay());
      return;
    }
    if (ProgramHeldMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        pageHolds(message.params.program);
        releaseUnneeded();
        return {};
      });
      return;
    }
  });

  return { compilerState, gameState, player };
}
