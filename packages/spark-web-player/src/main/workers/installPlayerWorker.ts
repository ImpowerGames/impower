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
  RunMenu,
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
import { LastRunMessage } from "./messages/LastRunMessage";
import { putAtStartPoint } from "./putAtStartPoint";
import { planRouteForSelection, routeGameTo } from "./planRouteForSelection";
import {
  RouteSearchLog,
  type RouteSearchOutcome,
  type RouteSearchReportTarget,
} from "./RouteSearchLog";
import { searchRouteFor } from "./searchRouteTo";
import { watchExecution } from "./watchExecution";

interface DisplayableProgram {
  id: string;
  program: SparkProgram;
  log: RouteSearchLog;
}

type StartPoint = { file: string; line: number; address?: ProgramAddress };

export function installPlayerWorker(connection: MessageConnection) {
  const player = {
    putAtStartPoint,
    keptPrograms: (): string[] => [...displayable.keys()],
    lastDisplayPath: (): DisplayPath | undefined => lastPath,
  };
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

  compiler.configure({
    seedBuiltinsIntoStory: true,
  });

  const source: ScriptSource = {
    lineText: (uri, line) => compiler.documents.get(uri)?.getLineText(line),
    structure: (uri) => compiler.structureOf(uri),
  };

  let routeSearches = new RouteSearchLog();

  let routePins: RoutePin[] = [];

  const searchRealRouteTo = (game: Game, to: ProgramAddress) =>
    searchRouteFor(game, to, routeSearches, {
      profilerId: compiler.profilerId,
      source,
    });

  const displayable = new Map<string, DisplayableProgram>();
  let canonicalId: string | undefined;
  const nameableRealIds: string[] = [];
  const newestSuggestionIds: string[] = [];
  const newestElsewhereIds: string[] = [];
  let shownSuggestionId: string | undefined;
  let displayedId: string | undefined;
  let requestedId: string | undefined;
  let heldId: string | undefined;

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
      gameState.game = gameState.createGame({ program });
      gameState.game.setRoutePins(routePins);
      profile("end", profilerId + " " + "game/create");
    } else if (gameState.game.program !== program) {
      updateGameProgram(gameState.game, program);
    }
    return gameState.game;
  };

  let routingTo: { file: string; line: number } | null = null;

  compiler.addEventListener("compiler/didCompile", (params) => {
    if (params.program.startFrom) {
      compiler.config.startFrom = params.program.startFrom;
    }
    if (
      params.produced &&
      compiledElsewhere(params.program, params.program.startFrom)
    ) {
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
        retain(entry);
      }
      releaseUnneeded();
      return;
    }
    routingTo = params.program.startFrom ?? null;
    if (!params.produced) {
      return;
    }
    routeSearches = new RouteSearchLog();
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

    if (params.program.startFrom) {
      profile("start", compiler.profilerId + " " + "game/setStartFrom");
      game.setStartFrom(params.program.startFrom, "last");
      profile("end", compiler.profilerId + " " + "game/setStartFrom");
      const to = game.startAddress;
      if (to != null) {
        searchRealRouteTo(game, to);
        routeSearches.report(params, to);
      }
    }
  });

  compiler.addEventListener("compiler/didPreviewCompile", (params) => {
    routingTo = params.startFrom;
    const profilerId = compiler.profilerId;
    if (!params.produced) {
      return;
    }
    gameTouches += 1;
    const game = createOrUpdateGame(params.program);
    const log = new RouteSearchLog();
    profile("start", profilerId + " " + "game/setStartFrom");
    game.setStartFrom(params.startFrom, "last");
    profile("end", profilerId + " " + "game/setStartFrom");
    const to = game.startAddress;
    if (to != null) {
      searchRouteFor(game, to, log, { profilerId, source });
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
    const running = gameState.running != null;
    if (!running) {
      gameTouches += 1;
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
      console.warn("Could not prefetch the selected scene's images:", e);
    }
  };

  let displays = 0;

  let standing: StandingDisplay | undefined;
  let lastPath: DisplayPath | undefined;

  let displayErrors: SimulationError[] | undefined;

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

  type RouteReport = {
    checkpoint?: string | StoredCheckpoint;
    simulatedAddress?: ProgramAddress | null;
    simulatedProgramId?: string;
    simulationFailure?: any;
    simulationErrors?: SimulationError[];
    shownFrom?: { file: string; line: number };
    shownAddress?: ProgramAddress;
    route?: PreviewRoute;
    menus?: RunMenu[];
  };

  const reportOf = (
    log: RouteSearchLog,
    to: ProgramAddress | null | undefined,
  ): RouteReport => {
    const report: RouteSearchReportTarget = {};
    log.report(report, to);
    return {
      ...report,
      checkpoint: log.checkpointFor(to),
      route: log.outcomeFor(to)?.route,
      menus: log.outcomeFor(to)?.menus,
    };
  };

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

  const searchIn =
    (entry: DisplayableProgram, fromStart: boolean) =>
    (searched: Game, address: ProgramAddress) =>
      searchRouteFor(searched, address, entry.log, {
        profilerId: compiler.profilerId,
        fromStart,
        source,
      });

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
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (display !== displays) {
      return { displayed: false };
    }
    routingTo = { file: params.file, line: params.line };
    let fresh = params.fresh === true;
    for (;;) {
      const entry = displayable.get(params.program);
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

  let current:
    | {
        run: number;
        game: Game;
        prefix: RunMenu[];
        stopped: Promise<void>;
        stop: () => void;
        channel?: BroadcastChannel;
      }
    | undefined;
  let runs = 0;
  let lastRun: RunMenu[] = [];

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

  const play = (params: PlayParams): PlayResult => {
    displays += 1;
    standing = undefined;
    routingTo = params.startFrom ?? null;
    pageHolds(params.program);
    const entry = displayable.get(params.program);
    const game = entry
      ? (gameState.game ?? createOrUpdateGame(entry.program))
      : undefined;
    if (!entry || !game) {
      return { built: false };
    }
    stopPlay({});
    const program = entry.program;
    if (game.program !== entry.program) {
      updateGameProgram(game, entry.program);
    }
    const start = params.startFrom
      ? startPoint(program, params.startFrom, "first")
      : undefined;
    const route: RouteReport = start
      ? routeTo(game, entry, start.point, start.beat)
      : {};
    lastRun = [];
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
      running.setStartFrom(route.shownFrom, "last");
    } else if (start && start.point !== params.startFrom) {
      running.setStartFrom(start.point, start.beat);
    }
    const errors = player.putAtStartPoint(
      running,
      {
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
    current = {
      run: ++runs,
      game: running,
      prefix: route.menus ?? [],
      stopped,
      stop,
    };
    return {
      built: true,
      compiled: isRunnableProgram(program),
      run: current.run,
      errors,
    };
  };

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

  const stopPlay = (params: StopPlayParams): StopPlayResult => {
    const ending = current;
    if (!ending || (params.run != null && params.run !== ending.run)) {
      return { location: null };
    }
    const location = ending.game.getLastExecutedDocumentLocation();
    lastRun = ending.game.runMenus(ending.prefix);
    current = undefined;
    gameState.running = undefined;
    ending.game.destroy();
    ending.channel?.close();
    ending.stop();
    return { location, choices: lastRun.length };
  };

  const runningAs = (run: number) => {
    if (!current || current.run !== run) {
      throw new NoGameError();
    }
    return current;
  };

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
        location ??=
          [gameState.running, gameState.game]
            .find((game) => game && (game.story as unknown) === story)
            ?.getLastExecutedDocumentLocation() ?? null;
      } catch (e) {
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
        const connected = await Promise.race([
          game.connect(sendFromPlay(game, channel)).then(() => true),
          stopped.then(() => false),
        ]);
        if (connected) {
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
    if (LastRunMessage.type.isRequest(message)) {
      connection.sendResponse(message, () => {
        const game = gameState.game;
        return {
          run:
            game && !gameState.running && lastRun.length > 0
              ? game.runMeetings(lastRun)
              : null,
        };
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
        for (const entry of displayable.values()) {
          entry.log = new RouteSearchLog();
        }
        routeSearches =
          (canonicalId && displayable.get(canonicalId)?.log) ||
          new RouteSearchLog();
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
