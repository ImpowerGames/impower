import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isRunnableProgram } from "@impower/sparkdown/src/compiler/utils/programSummary";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { DISCONNECTED } from "@impower/spark-engine/src/game/core/classes/Connection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import {
  installGameWorker,
  NoGameError,
} from "@impower/spark-engine/src/worker/installGameWorker";
import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerFileMessage";
import type { ProgramAddress } from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  executionWatch,
  type WatchedStory,
} from "@impower/sparkdown/src/runtime/ExecutionWatch";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";
import { programIdentity } from "../../utils/programIdentity";
import { planPreviewHint, type PreviewHintState } from "../utils/previewHint";
import { displayPreviewFrom } from "./displayPreviewFrom";
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
import { WorkerBusyMessage } from "./messages/WorkerBusyMessage";
import {
  StopPlayMessage,
  type StopPlayParams,
  type StopPlayResult,
} from "./messages/StopPlayMessage";
import { putAtStartPoint } from "./putAtStartPoint";
import { planRouteForSelection, routeGameTo } from "./planRouteForSelection";
import {
  RouteSearchLog,
  type RouteSearchReportTarget,
} from "./RouteSearchLog";
import { searchRouteFor } from "./searchRouteTo";
import { watchExecution } from "./watchExecution";

/** A program the worker's game can display, and what the route searches run
 *  in it established. */
interface DisplayableProgram {
  id: string;
  program: SparkProgram;
  /** Its own: a search run in one program says nothing about another. The
   *  newest real program's is `routeSearches`, whose searches the compiler
   *  remembers the choices of; no other program's are remembered. */
  log: RouteSearchLog;
}

/**
 * Everything the Game Preview's worker does: the player's compiler, the game
 * that plans and replays the route to the author's line on every compile and
 * selection and displays the stopped preview (`player/displayPreview`), and
 * PLAY's game, which runs beside it (`player/play`). The page holds only each
 * program's summary and no game.
 */
export function installPlayerWorker(connection: MessageConnection) {
  const player = {
    /** How PLAY's game is put at its start point. */
    putAtStartPoint,
    /** The identities of the programs the worker keeps to display, which
     *  stay bounded however long the author browses and edits. */
    keptPrograms: (): string[] => [...displayable.keys()],
  };
  // The warm-up is planned before the compiler handles the selection, which
  // can recompile the real documents first, so the fetches start as soon as
  // the selection arrives. Registered before the compiler's own listener,
  // which the connection calls in the order they were added.
  let lastHint: PreviewHintState | undefined;
  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
    if (!message) {
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
    summarize: true,
  });
  const gameState = installGameWorker(connection);
  const compiler = compilerState.compiler;

  // P5: the PLAYER's compiler seeds the builtins prelude into the program
  // (source-injection), so the engine can source `define` context from the
  // live `__def` tables (runtime inheritance: authored `as animation` inherits
  // the builtin `timing`, etc.). This is the player's OWN compiler instance —
  // the editor's LSP diagnostics compiler is separate and stays unseeded, so
  // keystroke latency is unaffected. configure() merges, so later editor
  // configures (files, startFrom, …) leave this flag set.
  //
  // The compiler builds statement chunks and the games run them on the
  // program engine, for every host of this worker: the web editor, the VS
  // Code game webview and the player app (docs/engine/binary-program.md,
  // section 9).
  compiler.configure({
    seedBuiltinsIntoStory: true,
  });

  // The record of what the last route search in the real program the game
  // holds established, and the rule for when that is safe to reuse. See
  // RouteSearchLog for why neither a checkpoint's existence nor the checkpoint
  // store's newest entry is evidence on its own. Each program a compile gives
  // the game starts a new one.
  let routeSearches = new RouteSearchLog();

  /** Plan a route to the address `to` and replay it for the real program.
   *  Every search here records its checkpoint as the value the game holds,
   *  which a display loads in place, and whose full save is written only for
   *  PLAY's game (#1758). */
  const searchRealRouteTo = (game: Game, to: ProgramAddress) =>
    searchRouteFor(game, to, routeSearches, {
      config: compiler.config,
      profilerId: compiler.profilerId,
    });

  // ---- The programs the game can display ----------------------------------
  //
  // The page names what it wants displayed and the game shows it from the
  // program compiled for it: every real program the page can still name,
  // which PLAY names too; the two newest suggestions, since the page asks
  // for one after the next may have compiled; the suggestion the page
  // shows, which a return to it displays again without compiling; the one
  // displayed last, which the page takes as shown once its display answers;
  // and the one the newest display asks for, from when its request arrives.
  // The worker keeps each of their programs, whose statement chunks stay as
  // they were built, and the program the game holds, which the game runs
  // until it is given another. Whatever nothing keeps is let go each time
  // that changes: after a compile, a preview compile, a program the page
  // takes, a display, PLAY, and a selection that gives the game the real
  // program back.
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
  const updateGameProgram = (game: Game, program: SparkProgram) => {
    gameTouches += 1;
    profile("start", compiler.profilerId + " " + "game/update");
    game.updateProgram(program);
    profile("end", compiler.profilerId + " " + "game/update");
  };

  const createOrUpdateGame = (program: SparkProgram) => {
    const profilerId = compiler.profilerId;
    if (!gameState.game) {
      profile("start", profilerId + " " + "game/create");
      // Built with what the editor has asked of the preview's debugger so
      // far.
      gameState.game = gameState.createGame({ program });
      profile("end", profilerId + " " + "game/create");
    } else if (gameState.game.program !== program) {
      // A compile that changed nothing serves the program the game already
      // holds, which needs no giving again.
      updateGameProgram(gameState.game, program);
    }
    return gameState.game;
  };

  /** The point the preview's game was last asked to route to or display,
   *  which the execution watch reports when a route or a display does not
   *  yield: the page must not ask for it again (#679). */
  let routingTo: { file: string; line: number } | null = null;

  compiler.addEventListener("compiler/didCompile", (params) => {
    routingTo = params.program.startFrom ?? null;
    if (!params.produced) {
      // A compile that produced no program that runs, which is one that
      // threw, leaves the game and the page with the program before it,
      // whose searches still describe it.
      return;
    }
    // Whatever the last search established was established against the OLD
    // program, so nothing from before this
    // compile may be reported for the new one. The old log stays with the old
    // program, which the page can still ask to display until it has taken
    // this one.
    routeSearches = new RouteSearchLog();
    // The route below is replayed on the game.
    gameTouches += 1;
    const game = createOrUpdateGame(params.program);
    const entry: DisplayableProgram = {
      id: programIdentity(params.program)!,
      program: params.program,
      log: routeSearches,
    };
    canonicalId = entry.id;
    if (nameableRealIds.at(-1) !== entry.id) {
      nameableRealIds.push(entry.id);
    }
    retain(entry);
    releaseUnneeded();

    // Plan and simulate route
    if (params.program.startFrom) {
      profile("start", compiler.profilerId + " " + "game/setStartFrom");
      // The route ends at the beat the preview shows: a line's last beat.
      game.setStartFrom(params.program.startFrom, "last");
      profile("end", compiler.profilerId + " " + "game/setStartFrom");
      const to = game.startAddress;
      if (to != null) {
        searchRealRouteTo(game, to);
        // Augment with what the search established about this start point.
        // The checkpoint stays in the log as a value: the answer to the page
        // leaves it out (`installSparkdownWorker`), and the display and PLAY
        // read it there.
        routeSearches.report(params, to);
      }
    }
  });

  // A preview compile answers one autocomplete suggestion. The game takes the
  // hypothetical program so the route to the author's line is replayed in it,
  // as it is for a real edit; the compiler recompiles the real documents
  // before the next selection is routed against this game (see
  // `selectDocument`).
  compiler.addEventListener("compiler/didPreviewCompile", (params) => {
    routingTo = params.startFrom;
    const profilerId = compiler.profilerId;
    if (!params.produced) {
      return;
    }
    // The route below is replayed on the game.
    gameTouches += 1;
    const game = createOrUpdateGame(params.program);
    const log = new RouteSearchLog();
    profile("start", profilerId + " " + "game/setStartFrom");
    game.setStartFrom(params.startFrom, "last");
    profile("end", profilerId + " " + "game/setStartFrom");
    const to = game.startAddress;
    if (to != null) {
      searchRouteFor(game, to, log, {
        config: compiler.config,
        profilerId,
        remember: false,
      });
      log.report(params, to);
    }
    const entry: DisplayableProgram = {
      id: programIdentity(params.program)!,
      program: params.program,
      log,
    };
    newestSuggestionIds.push(entry.id);
    if (newestSuggestionIds.length > 2) {
      newestSuggestionIds.shift();
    }
    retain(entry);
    releaseUnneeded();
  });

  compiler.addEventListener("compiler/didRemove", (params) => {
    if (compiler.config.startFrom?.file === params.textDocument.uri) {
      compiler.config.startFrom = undefined;
    }
  });

  compiler.addEventListener("compiler/didSelect", (params) => {
    routingTo = {
      file: params.textDocument.uri,
      line: params.selectedRange.start.line,
    };
    // PLAY's game shares this thread, so while it runs the game above is
    // left as it is and the selection replays no route (see
    // `planRouteForSelection`).
    const running = gameState.running != null;
    if (!running) {
      // The selection's route is replayed on the game.
      gameTouches += 1;
      // A selection is routed against the real program. The game can be
      // holding a suggestion it displayed again from its kept program, with
      // no compile since to give it the real one back.
      const kept = canonicalId ? displayable.get(canonicalId) : undefined;
      if (kept && gameState.game && gameState.game.program !== kept.program) {
        createOrUpdateGame(kept.program);
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

  /** What the step the display under way runs raises, which its answer
   *  carries with what the route raised, so the page reports the preview's
   *  run whole rather than hearing part of it before it knows the display is
   *  the one it shows. */
  let displayErrors: SimulationError[] | undefined;

  // Everything the game sends while it displays goes to the page, and
  // nothing while PLAY's game runs: the page shows that game alone, and a
  // stream from this one would supersede it there. A request it makes then
  // is answered here, as the page answers one it will not act on, so
  // nothing the game does waits for an answer that will not come.
  const sendToPage = (message: Message, transfer?: ArrayBuffer[]) => {
    const game = gameState.game;
    if (!game || (!isRequest(message) && !isNotification(message))) {
      return;
    }
    if (
      displayErrors &&
      GameEncounteredRuntimeErrorMessage.type.isNotification(message)
    ) {
      const { message: text, type, location } = message.params;
      displayErrors.push({ message: text, type, location });
      return;
    }
    if (gameState.running) {
      if (isRequest(message)) {
        game.connection.receive({
          jsonrpc: "2.0",
          id: message.id,
          method: message.method,
          error: { code: DISCONNECTED, message: "PLAY's game holds the page" },
        } as Message);
      }
      return;
    }
    connection.postMessage(message, transfer);
  };

  /** What a route search established about a point, as the display and
   *  PLAY read it. */
  type RouteReport = {
    checkpoint?: string | StoredCheckpoint;
    simulatedAddress?: ProgramAddress | null;
    simulatedProgramId?: string;
    simulationFailure?: any;
    simulationErrors?: SimulationError[];
  };

  /** The route to `point`'s `beat` in `entry`, with the game holding the
   *  entry's program: the search its log already holds for that path, or one
   *  run now. */
  const routeTo = (
    game: Game,
    entry: DisplayableProgram,
    point: { file: string; line: number },
    beat: "first" | "last",
  ): RouteReport => {
    const to = routeGameTo(
      game,
      point,
      beat,
      entry.log,
      (searched, address) =>
        searchRouteFor(searched, address, entry.log, {
          config: compiler.config,
          profilerId: compiler.profilerId,
          remember: entry.log === routeSearches,
        }),
      compiler.profilerId,
    );
    const report: RouteSearchReportTarget = {};
    entry.log.report(report, to);
    // The checkpoint as the log holds it, which `report` passes on only as a
    // full save.
    return { ...report, checkpoint: entry.log.checkpointFor(to) };
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
    routingTo = { file: params.file, line: params.line };
    let fresh = params.fresh === true;
    for (;;) {
      const entry = displayable.get(params.program);
      const game = gameState.game;
      if (!entry || !game) {
        return { displayed: false, missing: true };
      }
      const programChanged =
        fresh || displayedId !== entry.id || game.program !== entry.program;
      if (game.program !== entry.program) {
        updateGameProgram(game, entry.program);
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
      const stepErrors: SimulationError[] = [];
      displayErrors = stepErrors;
      const displaying = displayPreviewFrom(game, {
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
      let displayed: boolean;
      try {
        displayed = await displaying;
      } finally {
        if (displayErrors === stepErrors) {
          displayErrors = undefined;
        }
      }
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
      return displayed
        ? {
            displayed,
            errors: [...(route.simulationErrors ?? []), ...stepErrors],
          }
        : { displayed };
    }
  };

  // ---- PLAY ---------------------------------------------------------------
  //
  // PLAY's game is built beside the game above, with its own engine over the
  // program's statement chunks, which no later compile changes. While it
  // runs, the page shows it, hears from it and debugs it, and the game above
  // sends the page nothing (`sendToPage`) and replays no route for a
  // selection.

  /** PLAY's game while it runs, with the run the page knows it by, a
   *  settlement that STOP answers everything still waiting on it with, and
   *  the channel it sends the page its stream on once connected. */
  let current:
    | {
        run: number;
        game: Game;
        stopped: Promise<void>;
        stop: () => void;
        channel?: BroadcastChannel;
      }
    | undefined;
  let runs = 0;

  /** Where PLAY's game `running` sends the page what it shows, while it
   *  is the one that runs: a game STOP ended cannot write into the next
   *  run's stream. It goes on the page's `channel` rather than the
   *  connection, which Chromium holds after input (`WorkerGameLink`). No
   *  game message carries a transfer, which a channel cannot take. */
  const sendFromPlay =
    (running: Game, channel: BroadcastChannel) => (message: Message) => {
      if (
        gameState.running !== running ||
        !(isRequest(message) || isNotification(message))
      ) {
        return;
      }
      channel.postMessage(message);
    };

  /** Build PLAY's game for the program the page names, at the start point
   *  along the route to it. Taking the program supersedes a display under
   *  way. */
  const play = (params: PlayParams): PlayResult => {
    displays += 1;
    routingTo = params.startFrom ?? null;
    pageHolds(params.program);
    const entry = displayable.get(params.program);
    const game = gameState.game;
    if (!entry || !game) {
      return { built: false };
    }
    stopPlay({});
    // PLAY's game runs the program's statement chunks, which stay as they
    // were built however many compiles follow.
    const program = entry.program;
    if (game.program !== entry.program) {
      updateGameProgram(game, entry.program);
    }
    // PLAY from a line starts at its first beat (#721).
    const route: RouteReport = params.startFrom
      ? routeTo(game, entry, params.startFrom, "first")
      : {};
    releaseUnneeded();
    profile("start", compiler.profilerId + " " + "play/create");
    const running = gameState.createGame({
      program,
      startFrom: params.startFrom,
      restarted: params.restarted,
    });
    profile("end", compiler.profilerId + " " + "play/create");
    const errors = player.putAtStartPoint(
      running,
      params.simulationOptions,
      {
        // PLAY's game is a game of its own, whose story loads the route's
        // checkpoint from its full save, written here by the game that ran
        // the route, which holds the program it ran it in.
        checkpoint:
          typeof route.checkpoint === "object"
            ? (game.checkpointJson(route.checkpoint) ?? undefined)
            : route.checkpoint,
        address: route.simulatedAddress,
        programId: route.simulatedProgramId,
        failure: route.simulationFailure,
        errors: route.simulationErrors,
      },
      compiler.profilerId,
    );
    gameState.running = running;
    let stop!: () => void;
    const stopped = new Promise<void>((resolve) => (stop = resolve));
    current = { run: ++runs, game: running, stopped, stop };
    return {
      built: true,
      compiled: isRunnableProgram(program),
      run: current.run,
      errors,
    };
  };

  /** End PLAY's game, answering where it last executed: the run the page
   *  names, or whichever runs when it names none. A run already replaced is
   *  left alone. */
  const stopPlay = (params: StopPlayParams): StopPlayResult => {
    const ending = current;
    if (!ending || (params.run != null && params.run !== ending.run)) {
      return { location: null };
    }
    const location = ending.game.getLastExecutedDocumentLocation();
    current = undefined;
    gameState.running = undefined;
    ending.game.destroy();
    ending.channel?.close();
    ending.stop();
    return { location };
  };

  /** PLAY's game for the run the page names, if it still runs. */
  const runningAs = (run: number) => {
    if (!current || current.run !== run) {
      throw new NoGameError();
    }
    return current;
  };

  // ---- The execution watch -----------------------------------------------
  //
  // Everything above runs on this one thread, so a story that never yields
  // (a loop that does not end, in a preview's route or in PLAY's game)
  // leaves every request the page sends unanswered, STOP's among them. The
  // page cannot hear that from silence, which a long compile shares; it hears
  // it from these notices, which only a story running without a break sends,
  // and restarts the worker (`WorkerWatchdog`, #679).

  /** The program `story` runs, as far as the worker can tell. */
  const programOf = (story: WatchedStory): SparkProgram | undefined => {
    for (const game of [gameState.running, gameState.game]) {
      if (game && (game.story as unknown) === story) {
        return game.program;
      }
    }
    return canonicalId ? displayable.get(canonicalId)?.program : undefined;
  };

  executionWatch.listener = watchExecution({
    now: () => performance.now(),
    afterYield: (callback) => queueMicrotask(callback),
    notice: (story, busyMs) => {
      let location: DocumentLocation | null = null;
      try {
        const program = programOf(story);
        if (program) {
          location = Game.storyLocation(story as never, program);
        }
        // A story that stands nowhere (the program engine's, once its flow
        // has ended) is placed where its game last ran.
        location ??=
          [gameState.running, gameState.game]
            .find((game) => game && (game.story as unknown) === story)
            ?.getLastExecutedDocumentLocation() ?? null;
      } catch (e) {
        // Where it is matters less than that it is still running.
        console.warn("Could not locate the running story:", e);
      }
      const playing =
        gameState.running != null &&
        (gameState.running.story as unknown) === story;
      connection.sendNotification(WorkerBusyMessage.type, {
        busyMs: Math.round(busyMs),
        location,
        routingTo: playing ? null : routingTo,
      });
    },
  });

  connection.addEventListener("message", (e: MessageEvent) => {
    const message = e.data;
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
        const running = runningAs(message.params.run);
        const { game, stopped } = running;
        running.channel?.close();
        const channel = new BroadcastChannel(message.params.channel);
        running.channel = channel;
        // A game STOP ends while it connects never finishes its restore:
        // what the page answers from then on is not delivered to it.
        await Promise.race([
          game.connect(sendFromPlay(game, channel)),
          stopped,
        ]);
        return {};
      });
      return;
    }
    if (StartPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const { run, paused, seconds } = message.params;
        const { game } = runningAs(run);
        // Before its first frame, so a game the editor paused while PLAY
        // started never runs a frame unpaused.
        if (paused) {
          game.pause();
        }
        game.start();
        if (seconds) {
          game.skip(seconds);
        }
        return {};
      });
      return;
    }
    if (StopPlayMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => stopPlay(message.params));
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
