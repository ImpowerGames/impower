import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import type { Message } from "@impower/jsonrpc/src/common/types/Message";
import { isRunnableProgram } from "@impower/sparkdown/src/compiler/utils/programSummary";
import { programLocator } from "@impower/sparkdown/src/compiler/utils/programLocator";
import { isNotification } from "@impower/jsonrpc/src/common/utils/isNotification";
import { isRequest } from "@impower/jsonrpc/src/common/utils/isRequest";
import { DISCONNECTED } from "@impower/spark-engine/src/game/core/classes/Connection";
import { Game } from "@impower/spark-engine/src/game/core/classes/Game";
import type { StoredCheckpoint } from "@impower/spark-engine/src/game/core/classes/CheckpointStore";
import { GameEncounteredRuntimeErrorMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEncounteredRuntimeError";
import type { DocumentLocation } from "@impower/spark-engine/src/game/core/types/DocumentLocation";
import type {
  PreviewRoute,
  RoutePin,
  ScriptSource,
} from "@impower/spark-engine/src/game/core/types/PreviewRoute";
import { SetRoutePinsMessage } from "@impower/spark-editor-protocol/src/protocols/preview/SetRoutePinsMessage";
import {
  installGameWorker,
  NoGameError,
} from "@impower/spark-engine/src/worker/installGameWorker";
import { AddCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "@impower/sparkdown/src/compiler/classes/messages/SelectCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "@impower/sparkdown/src/compiler/classes/messages/UpdateCompilerFileMessage";
import {
  TOP_LEVEL_START,
  type ProgramAddress,
} from "@impower/sparkdown/src/compiler/types/ProgramAddress";
import type { SimulationError } from "@impower/sparkdown/src/compiler/types/SimulationError";
import type { SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import {
  executionWatch,
  type WatchedStory,
} from "@impower/sparkdown/src/runtime/ExecutionWatch";
import { installSparkdownWorker } from "@impower/sparkdown/src/worker/installSparkdownWorker";
import { profile } from "../../utils/profile";
import { compiledElsewhere } from "../../utils/compiledElsewhere";
import { programIdentity } from "../../utils/programIdentity";
import { planPreviewHint, type PreviewHintState } from "../utils/previewHint";
import { workerBeatOnly, type StandingDisplay } from "./classifyDisplay";
import { displayPreviewFrom, type DisplayPath } from "./displayPreviewFrom";
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
  type RouteSearchOutcome,
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
/** A point a display or PLAY routes to: a line, and the address it stands
 *  for when that is not the one the line resolves to (`Game.setStartFrom`). */
type StartPoint = { file: string; line: number; address?: ProgramAddress };

export function installPlayerWorker(connection: MessageConnection) {
  const player = {
    /** How PLAY's game is put at its start point. */
    putAtStartPoint,
    /** The identities of the programs the worker keeps to display, which
     *  stay bounded however long the author browses and edits. */
    keptPrograms: (): string[] => [...displayable.keys()],
    /** How the last display that went through to the game went (#657). */
    lastDisplayPath: (): DisplayPath | undefined => lastPath,
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

  /** The scripts as the compiler holds them, which a route's report reads
   *  (`Game.previewRouteOf`). */
  const source: ScriptSource = {
    lineText: (uri, line) => compiler.documents.get(uri)?.getLineText(line),
    structure: (uri) => compiler.structureOf(uri),
  };

  // The record of what the last route search in the real program the game
  // holds established, and the rule for when that is safe to reuse. See
  // RouteSearchLog for why neither a checkpoint's existence nor the checkpoint
  // store's newest entry is evidence on its own. Each program a compile gives
  // the game starts a new one.
  let routeSearches = new RouteSearchLog();

  /** The author's pins (`preview/setRoutePins`), which every game here
   *  plans its routes with. */
  let routePins: RoutePin[] = [];

  /** Plan a route to the address `to` and replay it for the real program.
   *  Every search here records its checkpoint as the value the game holds,
   *  which a display loads in place, and whose full save is written only for
   *  PLAY's game (#1758). */
  const searchRealRouteTo = (game: Game, to: ProgramAddress) =>
    searchRouteFor(game, to, routeSearches, {
      config: compiler.config,
      profilerId: compiler.profilerId,
      source,
    });

  // ---- The programs the game can display ----------------------------------
  //
  // The page names what it wants displayed and the game shows it from the
  // program compiled for it: every real program the page can still name,
  // which PLAY names too; the two newest suggestions, since the page asks
  // for one after the next may have compiled; the suggestion the page
  // shows, which a return to it displays again without compiling; the one
  // displayed last, which the page takes as shown once its display answers;
  // and the one the newest display asks for, from when its request arrives;
  // the two newest real programs compiled for a script the point they route
  // to is not in, which the game is not given but the page can still take
  // (see `compiler/didCompile`); and the real program the page last said it
  // holds. The worker keeps each of their programs, whose statement chunks stay as
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
  const newestElsewhereIds: string[] = [];
  let shownSuggestionId: string | undefined;
  let displayedId: string | undefined;
  let requestedId: string | undefined;
  let heldId: string | undefined;

  /** The page names `id` as the real program it holds, so none compiled
   *  before it can be named again. */
  const pageHolds = (id: string | undefined) => {
    if (id) {
      heldId = id;
    }
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
        !newestElsewhereIds.includes(id) &&
        id !== shownSuggestionId &&
        id !== displayedId &&
        id !== requestedId &&
        id !== heldId &&
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
      gameState.game.setRoutePins(routePins);
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
    if (params.program.startFrom) {
      // A compile routes to the point compiles route to from now on, as a
      // selection does (`rememberStartFrom` below): the workspace answers the
      // selection an edit leaves itself, so that point reaches the compiler
      // only with the edit's compile (#1881). A compile sent without a point
      // was given this one.
      compiler.config.startFrom = params.program.startFrom;
    }
    if (
      params.produced &&
      compiledElsewhere(params.program, params.program.startFrom)
    ) {
      // Compiled for a script the point it routes to is not in. The game
      // keeps the program it holds, so the display under way is not taken
      // over: on a cold start in VS Code a compile of each open script would
      // otherwise cancel the first display, and the page, which does not take
      // such a program, would never ask for it again (#1874). The program is
      // still kept for the page to name: the page judges by its own preview
      // point, which a selection the author did not make leaves where it was
      // while the point here moves, so it can take a program judged
      // elsewhere here. A display or PLAY that names it gives it to the game.
      // Only the two newest are kept, and the one the page holds: the page
      // need never take one of them, so none waits for the page to name a
      // later program before it goes, as the real programs it can name do.
      const entry: DisplayableProgram = {
        id: programIdentity(params.program)!,
        program: params.program,
        log: new RouteSearchLog(),
      };
      if (newestElsewhereIds.at(-1) !== entry.id) {
        newestElsewhereIds.push(entry.id);
        if (newestElsewhereIds.length > 2) {
          newestElsewhereIds.shift();
        }
      }
      if (!displayable.has(entry.id)) {
        // A compile that changed nothing serves a program already kept,
        // whose log stays.
        retain(entry);
      }
      releaseUnneeded();
      return;
    }
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
        source,
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

  /** The display the page shows, once it went up whole (#657); gone while
   *  one is under way, when one is taken over, and while PLAY holds the
   *  page. */
  let standing: StandingDisplay | undefined;
  let lastPath: DisplayPath | undefined;

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
    /** The line whose last beat the report's route reaches, when that is not
     *  the point asked for (`shownRoute`), and that beat's address. */
    shownFrom?: { file: string; line: number };
    shownAddress?: ProgramAddress;
    /** The route the checkpoint was replayed along, as the preview reports
     *  it. */
    route?: PreviewRoute;
  };

  /** What `log` holds about the address `to`, as the display and PLAY read
   *  it. */
  const reportOf = (
    log: RouteSearchLog,
    to: ProgramAddress | null | undefined,
  ): RouteReport => {
    const report: RouteSearchReportTarget = {};
    log.report(report, to);
    // The checkpoint as the log holds it, which `report` passes on only as a
    // full save.
    return {
      ...report,
      checkpoint: log.checkpointFor(to),
      route: log.outcomeFor(to)?.route,
    };
  };

  /** The route to `point`'s `beat` in `entry`, with the game holding the
   *  entry's program: the search its log already holds for that path, or one
   *  run now. A route that displays nothing on the way to a point a run
   *  from which displays nothing is searched for from the story's start
   *  (`showingOutcome`). A point no route reaches whose jumped run displays
   *  nothing answers the line above it that shows a beat
   *  (`jumpedShownRoute`). */
  const routeTo = (
    game: Game,
    entry: DisplayableProgram,
    point: StartPoint,
    beat: "first" | "last",
  ): RouteReport => {
    const to = routeGameTo(
      game,
      point,
      beat,
      entry.log,
      searchIn(entry, false),
      compiler.profilerId,
    );
    const outcome = showingOutcome(game, entry, to);
    const shown =
      outcome && !outcome.reachedTarget && !outcome.checkpoint
        ? jumpedShownRoute(game, entry, outcome)
        : undefined;
    if (!shown) {
      return reportOf(entry.log, to);
    }
    const log = new RouteSearchLog();
    log.record(shown.outcome);
    return {
      ...reportOf(log, shown.outcome.address),
      shownFrom: shown.point,
      shownAddress: shown.outcome.address,
    };
  };

  /** A route search that records what it establishes in `entry`'s log. */
  const searchIn =
    (entry: DisplayableProgram, fromStart: boolean) =>
    (searched: Game, address: ProgramAddress) =>
      searchRouteFor(searched, address, entry.log, {
        config: compiler.config,
        profilerId: compiler.profilerId,
        remember: entry.log === routeSearches,
        fromStart,
        source,
      });

  /**
   * What `entry`'s log holds about `to`, once a route that displays nothing
   * on the way to an address a run from which displays nothing (a `done` at
   * the top of a scene a divert enters) has been searched for again from the
   * story's start, whose flows before it may have left a beat on screen
   * (#1606). The replay of a route puts that beat in its checkpoint
   * (`Game.noteRouteTarget`). The route from the flow stands when the
   * story's start does not reach the address.
   */
  const showingOutcome = (
    game: Game,
    entry: DisplayableProgram,
    to: ProgramAddress | null | undefined,
  ): RouteSearchOutcome | undefined => {
    const outcome = entry.log.outcomeFor(to);
    if (to == null || outcome?.shows !== false || outcome.fromStart) {
      return outcome;
    }
    searchIn(entry, true)(game, to);
    const fromStart = entry.log.outcomeFor(to);
    if (fromStart?.reachedTarget) {
      return fromStart;
    }
    entry.log.record({ ...outcome, fromStart: true });
    return entry.log.outcomeFor(to);
  };

  /**
   * For an address no route reaches, which the display and PLAY jump
   * straight to: when the run jumped there displays nothing before the story
   * ends, the nearest line above it in the same scene whose jumped run shows
   * a beat, and what the search for that line established (#1606). No run
   * reaches the address, so no beat was on screen when one did. Kept on the
   * address's record, so a display or PLAY that asks again jumps nothing.
   */
  const jumpedShownRoute = (
    game: Game,
    entry: DisplayableProgram,
    outcome: RouteSearchOutcome,
  ): RouteSearchOutcome["shown"] => {
    if (outcome.jumpShows !== undefined) {
      return outcome.shown;
    }
    const to = outcome.address;
    const keep = (shown: RouteSearchOutcome["shown"], jumpShows: boolean) => {
      entry.log.record({ ...outcome, jumpShows, shown });
      return shown;
    };
    if (to === TOP_LEVEL_START || game.jumpShowsBeat(to)) {
      return keep(undefined, true);
    }
    const locator = programLocator(entry.program);
    const at = locator.locationOf(to);
    const scene = locator.sceneAt(to);
    if (!at) {
      return keep(undefined, false);
    }
    const tried = new Set<ProgramAddress>([to]);
    for (let line = at.startLine - 1; line >= 0; line -= 1) {
      const address = locator.addressAt(at.uri, line, { beat: "last" });
      if (address == null || tried.has(address)) {
        continue;
      }
      tried.add(address);
      const location = locator.locationOf(address);
      if (!location || location.startLine > line) {
        // A line with no address of its own takes the one below it.
        continue;
      }
      if (locator.sceneAt(address) !== scene) {
        break;
      }
      if (!game.jumpShowsBeat(address)) {
        continue;
      }
      const point = { file: at.uri, line };
      const reached = entry.log.outcomeFor(
        routeGameTo(
          game,
          point,
          "last",
          entry.log,
          searchIn(entry, false),
          compiler.profilerId,
        ),
      );
      return keep(reached ? { point, outcome: reached } : undefined, false);
    }
    return keep(undefined, false);
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
      // Before any compile has given the game a program, the page can still
      // name one compiled elsewhere (see `compiler/didCompile`), which builds
      // the game.
      const game = entry
        ? (gameState.game ?? createOrUpdateGame(entry.program))
        : undefined;
      if (!entry || !game) {
        return { displayed: false, missing: true };
      }
      const programChanged =
        fresh || displayedId !== entry.id || game.program !== entry.program;
      if (game.program !== entry.program) {
        updateGameProgram(game, entry.program);
      }
      const touches = gameTouches;
      // A line with no address of its own and none below it shows what the
      // line above it shows, as PLAY from it starts there (`startPoint`).
      const shown = startPoint(
        entry.program,
        { file: params.file, line: params.line },
        "last",
      );
      const route = routeTo(game, entry, shown.point, shown.beat);
      displayedId = entry.id;
      releaseUnneeded();
      const stepErrors: SimulationError[] = [];
      displayErrors = stepErrors;
      // Read before the display changes what the page shows; gone until
      // this display goes up whole (#657).
      const beatOnly = workerBeatOnly(standing, {
        game,
        fresh,
        speculative: params.speculative,
        checkpoint: route.checkpoint,
      });
      standing = undefined;
      let path: DisplayPath | undefined;
      const displaying = displayPreviewFrom(game, {
        program: entry.program,
        programChanged,
        file: shown.point.file,
        line: shown.point.line,
        address: shown.point.address,
        relocate: (from) =>
          startPoint(entry.program, { file: from.file, line: from.line }, "last")
            .point,
        speculative: params.speculative,
        checkpoint: route.checkpoint,
        simulationFailure: route.simulationFailure,
        route: route.route,
        runFrom: route.shownAddress,
        beatOnly,
        onPath: (taken) => {
          path = taken;
        },
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
      const taken: DisplayPath | undefined = path;
      lastPath = taken;
      if (displayed) {
        standing = { game, speculative: params.speculative };
      }
      return displayed
        ? {
            displayed,
            errors: [...(route.simulationErrors ?? []), ...stepErrors],
            ...(taken
              ? taken.beatOnly
                ? { path: "beat" as const }
                : { path: "full" as const, refused: taken.refused }
              : { path: "repeat" as const }),
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
    // PLAY's game takes the page: the next display connects in full.
    standing = undefined;
    routingTo = params.startFrom ?? null;
    pageHolds(params.program);
    const entry = displayable.get(params.program);
    // As a display does, PLAY builds the game from a program compiled
    // elsewhere when no compile has given it one.
    const game = entry
      ? (gameState.game ?? createOrUpdateGame(entry.program))
      : undefined;
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
    const start = params.startFrom
      ? startPoint(program, params.startFrom, "first")
      : undefined;
    const route: RouteReport = start
      ? routeTo(game, entry, start.point, start.beat)
      : {};
    releaseUnneeded();
    profile("start", compiler.profilerId + " " + "play/create");
    const running = gameState.createGame({
      program,
      startFrom: params.startFrom,
      restarted: params.restarted,
    });
    running.setRoutePins(routePins);
    profile("end", compiler.profilerId + " " + "play/create");
    if (route.shownFrom) {
      // A line no route reaches whose jumped run shows nothing starts at the
      // line above it that shows a beat (`jumpedShownRoute`).
      running.setStartFrom(route.shownFrom, "last");
    } else if (start && start.point !== params.startFrom) {
      running.setStartFrom(start.point, start.beat);
    }
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

  /**
   * The line and beat a display or PLAY of `point` routes to: the point's own
   * `beat`. The `end` that closes a scene or branch belongs to that flow,
   * not to the line below it, which another flow holds (#1618). It routes to
   * where the flow finishes:
   * - for a flow that runs off its end, the `Done` the compile ends it with
   *   (`ProgramRoot.flowEndAddress`), which a route reaches only when a run
   *   finishes the flow, whatever its conditionals decided; the point names
   *   that address, since the line of a scene's `end` can stand in a
   *   branch's lines or resolve elsewhere;
   * - for a flow that ends itself (a `done`, a `fin`, a divert), the last
   *   beat of its own nearest line above the `end` that has an address,
   *   passing over the branches written inside a scene, as the story stands
   *   once that line has run (#1606);
   * - for a scene that enters its first branch (one that binds no
   *   parameters), what that branch's `end` routes to.
   * A line with no address and none below it in its script (the blank lines
   * after the script's last `end`), or a closing `end` none of these place,
   * routes to the last beat of the nearest line above it that has one. With
   * no such line above, the point stands, and a run from it starts from
   * where its address leads, or from the top of the top-level content.
   */
  const startPoint = (
    program: SparkProgram,
    point: StartPoint,
    beat: "first" | "last",
  ): { point: StartPoint; beat: "first" | "last" } => {
    const locator = programLocator(program);
    const ends = program.flowEnds?.[point.file] ?? [];
    const closed = ends.find(([, end]) => end === point.line);
    if (!closed && locator.addressAt(point.file, point.line) != null) {
      return { point, beat };
    }
    // The nearest line from `from` up to the line after `floor` that has an
    // address of its own, passing over the lines of the flows `skipped` spans.
    const lineAbove = (
      from: number,
      floor: number,
      skipped: readonly (readonly [number, number])[],
    ) => {
      for (let line = from; line > floor; line -= 1) {
        if (skipped.some(([header, end]) => header <= line && line <= end)) {
          continue;
        }
        const address = locator.addressAt(point.file, line, { beat: "last" });
        const location = locator.locationOf(address);
        if (location && location.startLine <= line) {
          return { point: { file: point.file, line }, beat: "last" as const };
        }
      }
      return undefined;
    };
    if (closed) {
      const [header] = closed;
      const address = program.chunks?.flowEndAddress(point.file, header);
      if (address !== undefined) {
        return { point: { ...point, address }, beat: "last" };
      }
      const nested = ends.filter(([h, e]) => h > header && e < point.line);
      const own = lineAbove(point.line - 1, header, nested);
      if (own) {
        return own;
      }
      // A scene that runs nothing of its own before its first branch enters
      // that branch when it binds no parameters (`programFlows`).
      const first = nested.reduce<(typeof nested)[number] | undefined>(
        (earliest, flow) => (!earliest || flow[0] < earliest[0] ? flow : earliest),
        undefined,
      );
      if (first && program.chunks?.bindsParameters(point.file, first[0]) === false) {
        return startPoint(program, { file: point.file, line: first[1] }, beat);
      }
    }
    return lineAbove(point.line - 1, -1, []) ?? { point, beat };
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
        const connected = await Promise.race([
          game.connect(sendFromPlay(game, channel)).then(() => true),
          stopped.then(() => false),
        ]);
        if (connected) {
          // The connect opened a reconcile pass on the page; its stream has
          // gone out, so the page removes what it still shows that PLAY's
          // restored state did not write (#1222).
          game.module.ui.sweepReconcile();
        }
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
    if (SetRoutePinsMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        routePins = message.params.pins;
        gameState.game?.setRoutePins(routePins);
        // What every log established was established with the pins before,
        // so each program's searches start again.
        for (const entry of displayable.values()) {
          entry.log = new RouteSearchLog();
        }
        routeSearches =
          (canonicalId && displayable.get(canonicalId)?.log) ||
          new RouteSearchLog();
        // The point on screen can now be reached another way, or by the
        // same way with other decisions pinned, so the next display of it is
        // a first one, which reports its route, not a repeat of the one
        // shown.
        displayedId = undefined;
        standing = undefined;
        return {};
      });
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
