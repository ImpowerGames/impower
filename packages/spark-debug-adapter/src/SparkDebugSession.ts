/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/

import { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import { DidChangeGameStateMessage, GameStateMessage, type GameState } from "@impower/spark-editor-protocol/src/protocols/preview/GameStateMessage";
import {
  RollBackDebugRequest,
  RollForwardDebugRequest,
  type RollDebugArguments,
  type RollDebugResult,
} from "@impower/spark-editor-protocol/src/protocols/debug/RollDebugRequest";
import { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { ContinueGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/ContinueGameMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameClickedToContinueMessage";
import { GameEndedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameEndedMessage";
import { GameExitedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameHitBreakpointMessage";
import { GameStartedThreadMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-engine/src/game/core/classes/messages/GameSteppedMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameScriptsMessage";
import {
  GetGameStackTraceMessage,
  type GetGameStackTraceResult,
} from "@impower/spark-engine/src/game/core/classes/messages/GetGameStackTraceMessage";
import {
  GetGameThreadsMessage,
  type GetGameThreadsResult,
} from "@impower/spark-engine/src/game/core/classes/messages/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-engine/src/game/core/classes/messages/GetGameVariablesMessage";
import {
  PauseGameMessage,
  type PauseGameResult,
} from "@impower/spark-engine/src/game/core/classes/messages/PauseGameMessage";
import {
  RestartGameMessage,
  RestartGameParams,
} from "@impower/spark-engine/src/game/core/classes/messages/RestartGameMessage";
import {
  RollBackGameMessage,
  type RollBackGameResult,
} from "@impower/spark-engine/src/game/core/classes/messages/RollBackGameMessage";
import { RollForwardGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/RollForwardGameMessage";
import { SetGameBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameBreakpointsMessage";
import type { RollTarget } from "@impower/spark-engine/src/game/core/types/RunHistory";
import { SetGameDataBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameDataBreakpointsMessage";
import { SetGameFunctionBreakpointsMessage } from "@impower/spark-engine/src/game/core/classes/messages/SetGameFunctionBreakpointsMessage";
import { StepGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StepGameMessage";
import { StopGameMessage } from "@impower/spark-engine/src/game/core/classes/messages/StopGameMessage";
import {
  ContinuedEvent,
  ExitedEvent,
  Handles,
  InitializedEvent,
  InvalidatedEvent,
  Logger,
  logger,
  LoggingDebugSession,
  OutputEvent,
  Scope,
  Source,
  StackFrame,
  StoppedEvent,
  TerminatedEvent,
  ThreadEvent,
  Variable,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";

export interface SparkDebugSessionHost {
  readonly syncCursorToExecution: boolean;
}

export interface FileAccessor {
  isWindows: boolean;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  showFile(path: string): Promise<void>;
  getSelectedLine(path: string): Promise<number | undefined>;
  revealLine(path: string, line: number): Promise<void>;
  isActiveTextEditor(path: string): boolean;
  pathToUri(path: string): string;
  uriToPath(uri: string): string;
  getRootPath(path: string): string | undefined;
}

interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  program: string;
  stopOnEntry?: boolean;
  trace?: boolean;
  noDebug?: boolean;
}

interface IAttachRequestArguments extends ILaunchRequestArguments {}

const HELD_STOPS = new Set(["pause", "step", "breakpoint"]);

export class SparkDebugSession extends LoggingDebugSession {
  private _fileAccessor: FileAccessor;

  private _connection: Connection;

  private _host: SparkDebugSessionHost;

  private _variableHandles = new Handles<{
    scope: "temps" | "vars" | "defines";
    threadId?: number;
    frameId?: number;
  }>(-3);

  private _frames = new Map<number, { threadId: number; frameId: number }>();
  private _frameIds = new Map<string, number>();
  private _lineBreakpoints = new Map<string, { file: string; line: number }[]>();

  private _valuesInHex = false;
  private _useInvalidatedEvent = false;

  private _stoppedReason = new Map<number, string>();

  private _launchState: GameState["launchState"] = null;

  private _run: number | null | undefined;

  private _statePublications = 0;

  private _firstRead: Promise<void> | undefined;

  private _endStop: { run: number | null | undefined } | undefined;

  private _resuming: Promise<void> | undefined;

  private _finishFirstRead: (() => void) | undefined;

  public constructor(
    fileAccessor: FileAccessor,
    connection: Connection,
    host: SparkDebugSessionHost,
  ) {
    super("mock-debug.txt");

    this._fileAccessor = fileAccessor;

    this._connection = connection;
    this._host = host;
    this._connection.connectInput((msg) => this.onReceive(msg));

    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);
  }

  protected async onReceive(
    msg: RequestMessage | NotificationMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return new Promise((resolve) => {
      if ("id" in msg) {
        this.onReceiveRequest(msg).then((response) => {
          if (response) {
            resolve(response as any);
          }
        });
      } else {
        this.onReceiveNotification(msg);
      }
    });
  }

  protected async onReceiveNotification(message: NotificationMessage) {
    if (GameExitedMessage.type.isNotification(message)) {
      const { reason, error } = message.params;
      const exitCode =
        reason === "finished"
          ? 0
          : reason === "quit"
            ? 0
            : reason === "invalidated"
              ? 1
              : reason === "error"
                ? 2
                : 0;
      if (error) {
        this.sendErrorOutputEvent(error.message, error.location);
      }
      this.sendEvent(new ExitedEvent(exitCode));
      this.sendEvent(new TerminatedEvent());
    }
    if (GameEndedMessage.type.isNotification(message)) {
      const { error } = message.params;
      if (error) {
        this.sendErrorOutputEvent(error.message, error.location);
      }
      this.setLaunchState("ended");
      await this.sendStoppedEvent("end", message.params.run, true);
    }
    if (GameStartedThreadMessage.type.isNotification(message)) {
      const { threadId } = message.params;
      this.sendEvent(new ThreadEvent("started", threadId));
    }
    if (GameExitedThreadMessage.type.isNotification(message)) {
      const { threadId } = message.params;
      this.sendEvent(new ThreadEvent("exited", threadId));
    }
    if (GameSteppedMessage.type.isNotification(message)) {
      await this.sendStoppedEvent("step", message.params.run);
    }
    if (GameHitBreakpointMessage.type.isNotification(message)) {
      await this.sendStoppedEvent("breakpoint", message.params.run);
    }
    if (GameAwaitingInteractionMessage.type.isNotification(message)) {
      if (this._host.syncCursorToExecution) {
        await this.sendStoppedEvent("awaiting interaction", message.params.run);
      }
    }
    if (
      GameAutoAdvancedToContinueMessage.type.isNotification(message) ||
      GameClickedToContinueMessage.type.isNotification(message) ||
      GameChosePathToContinueMessage.type.isNotification(message)
    ) {
      this.sendContinuedEvent();
    }
    if (DidChangeGameStateMessage.type.isNotification(message)) {
      const reading = this._firstRead !== undefined;
      this._statePublications += 1;
      this.noteRun(message.params.run);
      this.setLaunchState(message.params.launchState);
      this.endFirstRead();
      if (reading && message.params.launchState === "ended") {
        await this.sendStoppedEvent("end", message.params.run, true);
      }
    }
  }

  protected async readGameState() {
    const publications = this._statePublications;
    this._firstRead = new Promise((resolve) => {
      this._finishFirstRead = resolve;
    });
    try {
      let state: GameState;
      try {
        state = await this._connection.emit(GameStateMessage.type.request({}));
      } catch {
        return;
      }
      if (!state || publications !== this._statePublications) {
        return;
      }
      this.noteRun(state.run);
      this.setLaunchState(state.launchState);
      this.endFirstRead();
      if (state.launchState === "ended") {
        await this.sendStoppedEvent("end", state.run, true);
      }
    } finally {
      this.endFirstRead();
    }
  }

  protected endFirstRead() {
    this._finishFirstRead?.();
    this._finishFirstRead = undefined;
    this._firstRead = undefined;
  }

  protected noteRun(run: number | null | undefined) {
    if (run !== undefined) {
      this._run = run;
    }
  }

  protected answersRun(
    answered: number | null | undefined,
    run: number | null | undefined,
  ) {
    return answered === undefined || run === undefined || answered === run;
  }

  protected isCurrentStop(reason: string, run: number | null | undefined) {
    if (run === null || (run !== undefined && run !== this._run)) {
      return false;
    }
    return (reason === "end") === (this._launchState === "ended");
  }

  protected setLaunchState(launchState: GameState["launchState"]) {
    if (launchState === this._launchState) {
      return;
    }
    const leftEnd = this._launchState === "ended";
    this._launchState = launchState;
    if (leftEnd) {
      this._endStop = undefined;
      this.sendContinuedEvent();
    }
  }

  protected async onReceiveRequest(
    _msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  protected async sendStoppedEvent(
    reason:
      | "step"
      | "breakpoint"
      | "exception"
      | "pause"
      | "entry"
      | "goto"
      | "function breakpoint"
      | "data breakpoint"
      | "instruction breakpoint"
      | "awaiting interaction"
      | "end",
    run: number | null | undefined = this._run,
    once = false,
  ) {
    let answer: GetGameThreadsResult;
    let resuming: Promise<void> | undefined;
    do {
      resuming = this._resuming;
      if (resuming) {
        await resuming;
      }
      answer = await this._connection.emit(
        GetGameThreadsMessage.type.request({}),
      );
      if (this._firstRead) {
        await this._firstRead;
      }
    } while (resuming !== this._resuming);
    if (
      (answer.stopped === false && HELD_STOPS.has(reason)) ||
      !this.answersRun(answer.run, run) ||
      !this.isCurrentStop(reason, run)
    ) {
      return;
    }
    if (once) {
      if (this._endStop && this._endStop.run === run) {
        return;
      }
      this._endStop = { run };
    }
    const { threads } = answer;
    for (const thread of threads) {
      this._stoppedReason.set(thread.id, reason);
      this.sendEvent(new StoppedEvent(reason, thread.id));
    }
  }

  protected async sendContinuedEvent() {
    this.sendEvent(new ContinuedEvent(0, true));
  }

  protected async sendErrorOutputEvent(
    message: string,
    location: {
      uri: string;
      range: {
        start: { line: number; character: number };
        end: { line: number; character: number };
      };
    },
  ) {
    let category = "stderr";
    const errorMessageOutputEvent: DebugProtocol.OutputEvent = new OutputEvent(
      `${message}\n`,
      category,
    );
    errorMessageOutputEvent.body.source = this.createSource(
      this._fileAccessor.uriToPath(location.uri),
    );
    errorMessageOutputEvent.body.line = this.convertDebuggerLineToClient(
      location.range.start.line,
    );
    errorMessageOutputEvent.body.column = this.convertDebuggerColumnToClient(
      location.range.start.character,
    );
    this.sendEvent(errorMessageOutputEvent);

    const filePath = this._fileAccessor.uriToPath(location.uri);
    const rootPath = this._fileAccessor.getRootPath(filePath);
    const file =
      this.getRelativePath(rootPath, filePath) ||
      this.getFilename(filePath) ||
      filePath;
    const errorLocationOutputEvent: DebugProtocol.OutputEvent = new OutputEvent(
      `    at ${file}:${location.range.start.line}:${location.range.start.character}:\n`,
      category,
    );
    errorLocationOutputEvent.body.source = this.createSource(
      this._fileAccessor.uriToPath(location.uri),
    );
    errorLocationOutputEvent.body.line = this.convertDebuggerLineToClient(
      location.range.start.line,
    );
    errorLocationOutputEvent.body.column = this.convertDebuggerColumnToClient(
      location.range.start.character,
    );
    this.sendEvent(errorLocationOutputEvent);
  }

  protected override initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments,
  ): void {
    if (args.supportsInvalidatedEvent) {
      this._useInvalidatedEvent = true;
    }

    response.body = response.body || {};

    response.body.supportsConfigurationDoneRequest = true;
    response.body.supportsRestartRequest = true;
    response.body.supportsStepBack = true;
    response.body.supportSuspendDebuggee = true;
    response.body.supportTerminateDebuggee = true;
    response.body.supportsBreakpointLocationsRequest = true;
    response.body.supportsFunctionBreakpoints = true;
    response.body.supportsLoadedSourcesRequest = true;

    response.body.supportsEvaluateForHovers = true;
    response.body.supportsDataBreakpoints = true;

    this.sendResponse(response);

    this.sendEvent(new InitializedEvent());
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments,
    _request?: DebugProtocol.Request,
  ) {
    if (!args.restart) {
      await this._connection.emit(
        StopGameMessage.type.request({
          restart: args.restart,
          suspend: args.suspendDebuggee,
          terminate: args.terminateDebuggee,
        }),
      );
    }
    this.sendResponse(response);
  }

  protected override async attachRequest(
    response: DebugProtocol.AttachResponse,
    args: IAttachRequestArguments,
  ) {
    return this.launchRequest(response, args);
  }

  protected override async restartRequest(
    response: DebugProtocol.RestartResponse,
    args: DebugProtocol.RestartArguments,
  ): Promise<void> {
    try {
      await this._connection.emit(
        RestartGameMessage.type.request(
          (args.arguments || {}) as RestartGameParams,
        ),
      );
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    }

    this.sendResponse(response);
  }

  protected sendRefusal(response: DebugProtocol.Response, error: unknown) {
    this.sendErrorResponse(response, {
      id: 2002,
      format: (error as { message?: string })?.message ?? String(error),
      showUser: true,
    });
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: ILaunchRequestArguments,
  ) {
    logger.setup(
      args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop,
      false,
    );

    const reading = this.readGameState();

    await this._fileAccessor.showFile(args.program);

    this.sendResponse(response);

    await reading;
  }

  protected override async pauseRequest(
    response: DebugProtocol.PauseResponse,
    _args: DebugProtocol.PauseArguments,
    _request?: DebugProtocol.Request,
  ) {
    const run = this._run;
    if (await this.answerEnded(response)) {
      return;
    }
    let answer: PauseGameResult;
    try {
      answer = await this._connection.emit(PauseGameMessage.type.request({}));
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    }
    this.sendResponse(response);
    if (this.answersRun(answer.run, run)) {
      await this.sendStoppedEvent("pause", run);
    }
  }

  protected override async continueRequest(
    response: DebugProtocol.ContinueResponse,
    _args: DebugProtocol.ContinueArguments,
  ) {
    if (await this.answerEnded(response)) {
      return;
    }
    let settle = () => {};
    this._resuming = new Promise((resolve) => {
      settle = resolve;
    });
    try {
      await this._connection.emit(ContinueGameMessage.type.request({}));
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    } finally {
      settle();
    }
    this.sendResponse(response);
  }

  protected async answerEnded(response: DebugProtocol.Response): Promise<boolean> {
    if (this._launchState !== "ended") {
      return false;
    }
    this.sendResponse(response);
    await this.sendStoppedEvent("end");
    return true;
  }

  protected override async reverseContinueRequest(
    response: DebugProtocol.ReverseContinueResponse,
    _args: DebugProtocol.ReverseContinueArguments,
  ) {
    await this.roll(response, RollBackGameMessage.type, "breakpoint");
  }

  protected override async nextRequest(
    response: DebugProtocol.NextResponse,
    _args: DebugProtocol.NextArguments,
  ) {
    await this.step(response, "over");
  }

  protected override async stepInRequest(
    response: DebugProtocol.StepInResponse,
    _args: DebugProtocol.StepInArguments,
  ) {
    await this.step(response, "in");
  }

  protected override async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    _args: DebugProtocol.StepOutArguments,
  ) {
    await this.step(response, "out");
  }

  protected async step(
    response: DebugProtocol.Response,
    traversal: "over" | "in" | "out",
  ) {
    if (await this.answerEnded(response)) {
      return;
    }
    try {
      await this._connection.emit(StepGameMessage.type.request({ traversal }));
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    }
    this.sendResponse(response);
  }

  protected override async stepBackRequest(
    response: DebugProtocol.StepBackResponse,
    _args: DebugProtocol.StepBackArguments,
  ) {
    await this.roll(response, RollBackGameMessage.type, "beat");
  }

  protected async roll(
    response: DebugProtocol.Response,
    type: typeof RollBackGameMessage.type | typeof RollForwardGameMessage.type,
    to: RollTarget,
  ) {
    let result: RollBackGameResult;
    try {
      result = await this._connection.emit(type.request({ to, hold: true }));
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    }
    if (!result.moved && "reason" in result) {
      this.sendRefusal(response, { message: result.reason });
      return;
    }
    const body: RollDebugResult = { moved: result.moved };
    response.body = body;
    this.sendResponse(response);
    if (result.held) {
      await this.sendStoppedEvent("step", result.run);
    }
  }

  protected override stepInTargetsRequest(
    response: DebugProtocol.StepInTargetsResponse,
    _args: DebugProtocol.StepInTargetsArguments,
  ) {
    this.sendResponse(response);
  }

  protected override async loadedSourcesRequest(
    response: DebugProtocol.LoadedSourcesResponse,
    _args: DebugProtocol.LoadedSourcesArguments,
  ) {
    const { uris } = await this._connection.emit(
      GetGameScriptsMessage.type.request({}),
    );
    response.body = {
      sources: uris.map((uri) =>
        this.createSource(this._fileAccessor.uriToPath(uri)),
      ),
    };
    this.sendResponse(response);
  }

  protected override async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments,
  ): Promise<void> {
    const file = this._fileAccessor.pathToUri(args.source.path || "");
    const requested = (args.breakpoints ?? []).map((b) => ({
      file,
      line: this.convertClientLineToDebugger(b.line),
    }));
    this._lineBreakpoints.delete(file);
    const others = [...this._lineBreakpoints.values()].flat();
    if (requested.length > 0) {
      this._lineBreakpoints.set(file, requested);
    }

    const { breakpoints } = await this._connection.emit(
      SetGameBreakpointsMessage.type.request({
        breakpoints: [...others, ...requested],
      }),
    );

    response.body = {
      breakpoints: (breakpoints || []).slice(others.length).map((b) => ({
        ...b,
        source:
          b.location != null
            ? this.createSource(this._fileAccessor.uriToPath(b.location.uri))
            : undefined,
        line:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.start.line)
            : undefined,
        column:
          b.location != null
            ? this.convertDebuggerColumnToClient(
                b.location.range.start.character,
              )
            : undefined,
        endLne:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.end.line)
            : undefined,
        endColumn:
          b.location != null
            ? this.convertDebuggerColumnToClient(b.location.range.end.character)
            : undefined,
      })),
    };

    this.sendResponse(response);
  }

  protected override async setFunctionBreakPointsRequest(
    response: DebugProtocol.SetFunctionBreakpointsResponse,
    args: DebugProtocol.SetFunctionBreakpointsArguments,
    _request?: DebugProtocol.Request,
  ) {

    const setFunctionBreakpoints: {
      name: string;
    }[] = [];

    if (args.breakpoints) {
      for (const b of args.breakpoints) {
        setFunctionBreakpoints.push({
          name: b.name,
        });
      }
    }

    const { functionBreakpoints } = await this._connection.emit(
      SetGameFunctionBreakpointsMessage.type.request({
        functionBreakpoints: setFunctionBreakpoints,
      }),
    );

    response.body = {
      breakpoints: (functionBreakpoints || []).map((b) => ({
        ...b,
        source:
          b.location != null
            ? this.createSource(this._fileAccessor.uriToPath(b.location.uri))
            : undefined,
        line:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.start.line)
            : undefined,
        column:
          b.location != null
            ? this.convertDebuggerColumnToClient(
                b.location.range.start.character,
              )
            : undefined,
        endLne:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.end.line)
            : undefined,
        endColumn:
          b.location != null
            ? this.convertDebuggerColumnToClient(b.location.range.end.character)
            : undefined,
      })),
    };

    this.sendResponse(response);
  }

  protected override async breakpointLocationsRequest(
    response: DebugProtocol.BreakpointLocationsResponse,
    args: DebugProtocol.BreakpointLocationsArguments,
    _request?: DebugProtocol.Request,
  ) {

    const { lines } = await this._connection.emit(
      GetGamePossibleBreakpointLocationsMessage.type.request({
        search: {
          uri: this._fileAccessor.pathToUri(args.source.path || ""),
          range: {
            start: {
              line: this.convertClientLineToDebugger(args.line),
              character: this.convertClientColumnToDebugger(args.column ?? 1),
            },
            end: {
              line: this.convertClientLineToDebugger(args.endLine ?? args.line),
              character: this.convertClientColumnToDebugger(
                args.endColumn ?? args.column ?? 1,
              ),
            },
          },
        },
      }),
    );

    response.body = {
      breakpoints: lines.map((l) => ({
        line: this.convertDebuggerLineToClient(l),
        column: this.convertDebuggerColumnToClient(0),
        endLne: this.convertDebuggerLineToClient(l),
        endColumn: this.convertDebuggerColumnToClient(0),
      })),
    };

    this.sendResponse(response);
  }

  protected override async setExceptionBreakPointsRequest(
    response: DebugProtocol.SetExceptionBreakpointsResponse,
    _args: DebugProtocol.SetExceptionBreakpointsArguments,
  ): Promise<void> {

    this.sendResponse(response);
  }

  protected override exceptionInfoRequest(
    response: DebugProtocol.ExceptionInfoResponse,
    _args: DebugProtocol.ExceptionInfoArguments,
  ) {
    response.body = {
      exceptionId: "Exception ID",
      description: "This is a descriptive description of the exception.",
      breakMode: "always",
      details: {
        message: "Message contained in the exception.",
        typeName: "Short type name of the exception object",
        stackTrace: "stack frame 1\nstack frame 2",
      },
    };
    this.sendResponse(response);
  }

  protected override async threadsRequest(
    response: DebugProtocol.ThreadsResponse,
  ) {
    const { threads } = await this._connection.emit(
      GetGameThreadsMessage.type.request({}),
    );
    response.body = {
      threads,
    };
    this.sendResponse(response);
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments,
  ) {
    this._variableHandles.reset();
    const reason = this._stoppedReason.get(args.threadId);
    this._stoppedReason.delete(args.threadId);
    let trace: GetGameStackTraceResult;
    try {
      trace = await this._connection.emit(
        GetGameStackTraceMessage.type.request({
          threadId: args.threadId,
          startFrame: args.startFrame,
          levels: args.levels,
        }),
      );
    } catch (e) {
      this.sendRefusal(response, e);
      return;
    }
    const { stackFrames, totalFrames } = trace;
    const clientStackFrames: StackFrame[] = [];
    for (const stackFrame of stackFrames) {
      const clientStackFrame: StackFrame =
        reason === "awaiting interaction"
          ?
            {
              ...stackFrame,
              source: this.createSource(
                this._fileAccessor.uriToPath(stackFrame.location.uri),
              ),
              line: this.convertDebuggerLineToClient(
                stackFrame.location.range.start.line,
              ),
              column: 0,
            }
          : {
              ...stackFrame,
              source: this.createSource(
                this._fileAccessor.uriToPath(stackFrame.location.uri),
              ),
              line: this.convertDebuggerLineToClient(
                stackFrame.location.range.start.line,
              ),
              column: this.convertDebuggerColumnToClient(
                stackFrame.location.range.start.character,
              ),
              endLine: this.convertDebuggerLineToClient(
                stackFrame.location.range.end.line,
              ),
              endColumn: this.convertDebuggerColumnToClient(
                stackFrame.location.range.end.character,
              ),
            };
      clientStackFrame.id = this.clientFrameId(args.threadId, stackFrame.id);
      clientStackFrames.push(clientStackFrame);
    }
    response.body = {
      stackFrames: clientStackFrames,
      totalFrames,
    };
    this.sendResponse(response);
  }

  protected clientFrameId(threadId: number, frameId: number): number {
    const key = `${threadId}:${frameId}`;
    let id = this._frameIds.get(key);
    if (id === undefined) {
      id = this._frameIds.size + 1;
      this._frameIds.set(key, id);
      this._frames.set(id, { threadId, frameId });
    }
    return id;
  }

  protected override scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments,
  ): void {
    const frame = this._frames.get(args.frameId);
    response.body = {
      scopes: [
        new Scope(
          "Temps",
          this._variableHandles.create({ scope: "temps", ...frame }),
          false,
        ),
        new Scope("Vars", this._variableHandles.create({ scope: "vars" }), false),
        new Scope(
          "Defines",
          this._variableHandles.create({ scope: "defines" }),
          true,
        ),
      ],
    };
    this.sendResponse(response);
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
    _request?: DebugProtocol.Request,
  ): Promise<void> {

    let vars: Variable[] = [];

    const handle = this._variableHandles.get(args.variablesReference);
    const scope = handle?.scope;
    if (scope === "temps") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "temps",
          threadId: handle?.threadId,
          frameId: handle?.frameId,
        }),
      );
      vars = variables;
    } else if (scope === "vars") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "vars",
        }),
      );
      vars = variables;
    } else if (scope === "defines") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "defines",
          variablesReference: args.variablesReference,
        }),
      );
      vars = variables;
    } else {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "children",
          variablesReference: args.variablesReference,
        }),
      );
      vars = variables;
    }

    response.body = {
      variables: vars,
    };

    this.sendResponse(response);
  }

  protected override async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments,
  ): Promise<void> {

    const frame =
      args.frameId != null ? this._frames.get(args.frameId) : undefined;
    const { context } = await this._connection.emit(
      GetGameEvaluationContextMessage.type.request({ ...frame }),
    );

    const value = args.expression
      .split(".")
      .reduce(
        (obj, key) =>
          obj != null &&
          typeof obj === "object" &&
          Object.prototype.hasOwnProperty.call(obj, key)
            ? obj[key]
            : undefined,
        context,
      );

    if (value === undefined && args.context === "hover") {
      this.sendErrorResponse(response, {
        id: 2001,
        format: "not available in this frame",
        showUser: false,
      });
      return;
    }

    const { variables } = await this._connection.emit(
      GetGameVariablesMessage.type.request({
        scope: "value",
        value,
      }),
    );
    const variable = variables[0];

    response.body = {
      ...(variable || {}),
      result: variable?.value ?? "undefined",
      variablesReference: variable?.variablesReference ?? 0,
    };

    this.sendResponse(response);
  }

  protected override async setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    _args: DebugProtocol.SetVariableArguments,
  ) {

    this.sendResponse(response);
  }

  protected override async dataBreakpointInfoRequest(
    response: DebugProtocol.DataBreakpointInfoResponse,
    args: DebugProtocol.DataBreakpointInfoArguments,
  ) {

    response.body = {
      dataId: null,
      description: "Cannot break on data",
      accessTypes: undefined,
      canPersist: false,
    };

    if (args.variablesReference && args.name) {
      const handle = this._variableHandles.get(args.variablesReference);
      const scope = handle?.scope;
      if (scope === "temps") {
        const { variables } = await this._connection.emit(
          GetGameVariablesMessage.type.request({
            scope: "temps",
            threadId: handle?.threadId,
            frameId: handle?.frameId,
          }),
        );
        const variable = variables.find((v) => v.name === args.name);
        if (variable) {
          response.body.dataId = variable.scopePath
            ? variable.scopePath + "." + args.name
            : args.name;
          response.body.description = args.name;
          response.body.accessTypes = ["write"];
          response.body.canPersist = true;
        }
      } else if (scope === "vars") {
        const { variables } = await this._connection.emit(
          GetGameVariablesMessage.type.request({
            scope: "vars",
          }),
        );
        const variable = variables.find((v) => v.name === args.name);
        if (variable) {
          response.body.dataId = args.name;
          response.body.description = args.name;
          response.body.accessTypes = ["write"];
          response.body.canPersist = true;
        }
      } else {
        response.body = {
          dataId: null,
          description: "Value will never change",
          accessTypes: undefined,
          canPersist: false,
        };
      }
    }

    this.sendResponse(response);
  }

  protected override async setDataBreakpointsRequest(
    response: DebugProtocol.SetDataBreakpointsResponse,
    args: DebugProtocol.SetDataBreakpointsArguments,
  ) {

    const { dataBreakpoints } = await this._connection.emit(
      SetGameDataBreakpointsMessage.type.request({
        dataBreakpoints: args.breakpoints,
      }),
    );

    response.body = {
      breakpoints: (dataBreakpoints || []).map((b) => ({
        ...b,
        source:
          b.location != null
            ? this.createSource(this._fileAccessor.uriToPath(b.location.uri))
            : undefined,
        line:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.start.line)
            : undefined,
        column:
          b.location != null
            ? this.convertDebuggerColumnToClient(
                b.location.range.start.character,
              )
            : undefined,
        endLne:
          b.location != null
            ? this.convertDebuggerLineToClient(b.location.range.end.line)
            : undefined,
        endColumn:
          b.location != null
            ? this.convertDebuggerColumnToClient(b.location.range.end.character)
            : undefined,
      })),
    };

    this.sendResponse(response);
  }

  protected override setExpressionRequest(
    response: DebugProtocol.SetExpressionResponse,
    _args: DebugProtocol.SetExpressionArguments,
  ): void {
    this.sendResponse(response);
  }

  protected override cancelRequest(
    _response: DebugProtocol.CancelResponse,
    _args: DebugProtocol.CancelArguments,
  ) {
  }

  protected override customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: any,
  ) {
    if (command === "toggleFormatting") {
      this._valuesInHex = !this._valuesInHex;
      if (this._useInvalidatedEvent) {
        this.sendEvent(new InvalidatedEvent(["variables"]));
      }
      this.sendResponse(response);
    } else if (command === RollBackDebugRequest.command) {
      void this.roll(
        response,
        RollBackGameMessage.type,
        (args as RollDebugArguments).to,
      );
    } else if (command === RollForwardDebugRequest.command) {
      void this.roll(
        response,
        RollForwardGameMessage.type,
        (args as RollDebugArguments).to,
      );
    } else {
      super.customRequest(command, response, args);
    }
  }

  private createSource(filePath: string): Source {
    const rootPath = this._fileAccessor.getRootPath(filePath);
    const name =
      this.getRelativePath(rootPath, filePath) ||
      this.getFilename(filePath) ||
      filePath;
    return new Source(
      name,
      this.convertDebuggerPathToClient(filePath),
      undefined,
      undefined,
      "sparkdown",
    );
  }

  private getFilename(path: string) {
    const parts = path.split(/[\/\\]/).filter(Boolean);
    return parts.at(-1);
  }

  private getRelativePath(fromPath: string | undefined, toPath: string) {
    if (!fromPath) {
      return undefined;
    }
    const fromParts = fromPath.split(/[\/\\]/).filter(Boolean);
    const toParts = toPath.split(/[\/\\]/).filter(Boolean);

    let commonIndex = 0;
    while (
      commonIndex < fromParts.length &&
      commonIndex < toParts.length &&
      fromParts[commonIndex] === toParts[commonIndex]
    ) {
      commonIndex++;
    }

    const upMoves = fromParts.length - commonIndex;
    const downMoves = toParts.slice(commonIndex);

    return "../".repeat(upMoves) + downMoves.join("/");
  }
}
