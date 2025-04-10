/*---------------------------------------------------------
 * Copyright (C) Microsoft Corporation. All rights reserved.
 *--------------------------------------------------------*/
/*
 * mockDebug.ts implements the Debug Adapter that "adapts" or translates the Debug Adapter Protocol (DAP) used by the client (e.g. VS Code)
 * into requests and events of the real "execution engine" or "debugger" (here: class MockRuntime).
 * When implementing your own debugger extension for VS Code, most of the work will go into the Debug Adapter.
 * Since the Debug Adapter is independent from VS Code, it can be used in any client (IDE) supporting the Debug Adapter Protocol.
 *
 * The most important class of the Debug Adapter is the MockDebugSession which implements many DAP requests by talking to the MockRuntime.
 */

import { ConfigureGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ConfigureGameMessage";
import { ContinueGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/ContinueGameMessage";
import { GameAutoAdvancedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameClickedToContinueMessage";
import { GameExitedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedMessage";
import { GameExitedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameExitedThreadMessage";
import { GameHitBreakpointMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameHitBreakpointMessage";
import { GameStartedThreadMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameStartedThreadMessage";
import { GameSteppedMessage } from "@impower/spark-editor-protocol/src/protocols/game/GameSteppedMessage";
import { GetGameEvaluationContextMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameEvaluationContextMessage";
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameScriptsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameScriptsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { GetGameVariablesMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameVariablesMessage";
import { PauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/PauseGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import { UnpauseGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/UnpauseGameMessage";
import {
  NotificationMessage,
  RequestMessage,
  ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
import { SparkdownCompiler } from "@impower/sparkdown/src/classes/SparkdownCompiler";
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
  ProgressEndEvent,
  ProgressStartEvent,
  ProgressUpdateEvent,
  Scope,
  Source,
  StackFrame,
  StoppedEvent,
  TerminatedEvent,
  ThreadEvent,
  Variable,
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import { timeout } from "./mockRuntime";

export interface FileAccessor {
  isWindows: boolean;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  showFile(path: string): Promise<void>;
  getSelectedLine(path: string): Promise<number | undefined>;
  setSelectedLine(path: string, line: number): Promise<void>;
  pathToUri(path: string): string;
  uriToPath(uri: string): string;
  getRootPath(path: string): string | undefined;
}

/**
 * This interface describes the mock-debug specific launch attributes
 * (which are not part of the Debug Adapter Protocol).
 * The schema for these attributes lives in the package.json of the mock-debug extension.
 * The interface should always match this schema.
 */
interface ILaunchRequestArguments extends DebugProtocol.LaunchRequestArguments {
  /** An absolute path to the "program" to debug. */
  program: string;
  /** Automatically stop target after launch. If not specified, target does not stop. */
  stopOnEntry?: boolean;
  /** enable logging the Debug Adapter Protocol */
  trace?: boolean;
  /** run without debugging */
  noDebug?: boolean;
}

interface IAttachRequestArguments extends ILaunchRequestArguments {}

export class SparkDebugSession extends LoggingDebugSession {
  private _fileAccessor: FileAccessor;

  private _connection: Connection;

  private _variableHandles = new Handles<
    "temps" | "vars" | "lists" | "defines"
  >(-3);

  private _launchProgram = "";
  private _launchLine = 0;
  private _configurationDone = false;
  private _configurationDoneListeners = new Set<() => void>();

  private _cancellationTokens = new Map<number, boolean>();

  private _reportProgress = false;
  private _progressId = 10000;
  private _cancelledProgressId: string | undefined = undefined;
  private _isProgressCancellable = true;

  private _valuesInHex = false;
  private _useInvalidatedEvent = false;

  private _addressesInHex = true;

  /**
   * Creates a new debug adapter that is used for one debug session.
   * We configure the default implementation of a debug adapter here.
   */
  public constructor(fileAccessor: FileAccessor, connection: Connection) {
    super("mock-debug.txt");

    this._fileAccessor = fileAccessor;

    this._connection = connection;
    this._connection.connectInput((msg) => this.onReceive(msg));

    // this debugger uses zero-based lines and columns
    this.setDebuggerLinesStartAt1(false);
    this.setDebuggerColumnsStartAt1(false);
  }

  protected async onReceive(
    msg: RequestMessage | NotificationMessage
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
    if (GameStartedThreadMessage.type.isNotification(message)) {
      const { threadId } = message.params;
      this.sendEvent(new ThreadEvent("started", threadId));
    }
    if (GameExitedThreadMessage.type.isNotification(message)) {
      const { threadId } = message.params;
      this.sendEvent(new ThreadEvent("exited", threadId));
    }
    if (GameSteppedMessage.type.isNotification(message)) {
      await this.sendStoppedEvent("step");
    }
    if (GameHitBreakpointMessage.type.isNotification(message)) {
      await this.sendStoppedEvent("breakpoint");
    }
    if (GameAwaitingInteractionMessage.type.isNotification(message)) {
      await this.sendStoppedEvent("awaiting interaction");
    }
    if (GameAutoAdvancedToContinueMessage.type.isNotification(message)) {
      this.sendContinuedEvent();
    }
    if (GameClickedToContinueMessage.type.isNotification(message)) {
      this.sendContinuedEvent();
    }
    if (GameChosePathToContinueMessage.type.isNotification(message)) {
      this.sendContinuedEvent();
    }
  }

  protected async onReceiveRequest(
    _msg: RequestMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    // TODO
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
  ) {
    const { threads } = await this._connection.emit(
      GetGameThreadsMessage.type.request({})
    );
    for (const thread of threads) {
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
    }
  ) {
    let category = "stderr";
    const errorMessageOutputEvent: DebugProtocol.OutputEvent = new OutputEvent(
      `${message}\n`,
      category
    );
    errorMessageOutputEvent.body.source = this.createSource(
      this._fileAccessor.uriToPath(location.uri)
    );
    errorMessageOutputEvent.body.line = this.convertDebuggerLineToClient(
      location.range.start.line
    );
    errorMessageOutputEvent.body.column = this.convertDebuggerColumnToClient(
      location.range.start.character
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
      category
    );
    errorLocationOutputEvent.body.source = this.createSource(
      this._fileAccessor.uriToPath(location.uri)
    );
    errorLocationOutputEvent.body.line = this.convertDebuggerLineToClient(
      location.range.start.line
    );
    errorLocationOutputEvent.body.column = this.convertDebuggerColumnToClient(
      location.range.start.character
    );
    this.sendEvent(errorLocationOutputEvent);
  }

  /**
   * The 'initialize' request is the first request called by the frontend
   * to interrogate the features the debug adapter provides.
   */
  protected override initializeRequest(
    response: DebugProtocol.InitializeResponse,
    args: DebugProtocol.InitializeRequestArguments
  ): void {
    if (args.supportsProgressReporting) {
      this._reportProgress = true;
    }
    if (args.supportsInvalidatedEvent) {
      this._useInvalidatedEvent = true;
    }

    // build and return the capabilities of this debug adapter:
    response.body = response.body || {};

    response.body.supportsConfigurationDoneRequest = true;
    // make VS Code only support pause button
    response.body.supportSuspendDebuggee = true;
    // make VS Code only support stop button
    response.body.supportTerminateDebuggee = true;
    // make VS Code only support adding breakpoint at valid location
    response.body.supportsBreakpointLocationsRequest = true;
    // make VS Code show "Add Function Breakpoint" plus button in "BREAKPOINTS" panel
    response.body.supportsFunctionBreakpoints = true;
    // make VS Code show "LOADED SCRIPTS" panel
    response.body.supportsLoadedSourcesRequest = true;

    // TODO
    // make VS Code use 'evaluate' when hovering over source
    response.body.supportsEvaluateForHovers = true;
    // make VS Code support "Break on Value Read", "Break on Value Change", or "Break on Value Access"
    // In the context menu of the "BREAKPOINTS" panel
    response.body.supportsDataBreakpoints = true;
    // // make VS Code send setVariable request
    // response.body.supportsSetVariable = true;
    // // make VS Code send setExpression request
    // response.body.supportsSetExpression = true;

    // // make VS Code show a 'step back' button
    // response.body.supportsStepBack = true;
    // // make VS Code support a restarting a frame
    // supportsRestartFrame?: boolean;
    // // make VS Code provide "Step in Target" functionality
    // response.body.supportsStepInTargetsRequest = true;

    // // the adapter defines two exceptions filters, one with support for conditions.
    // response.body.supportsExceptionFilterOptions = true;
    // response.body.exceptionBreakpointFilters = [
    //   {
    //     filter: "namedException",
    //     label: "Named Exception",
    //     description: `Break on named exceptions. Enter the exception's name as the Condition.`,
    //     default: false,
    //     supportsCondition: true,
    //     conditionDescription: `Enter the exception's name`,
    //   },
    //   {
    //     filter: "otherExceptions",
    //     label: "Other Exceptions",
    //     description: "This is a other exception",
    //     default: true,
    //     supportsCondition: false,
    //   },
    // ];
    // // make VS Code send exceptionInfo request
    // response.body.supportsExceptionInfoRequest = true;

    // // make VS Code send cancel request
    //  response.body.supportsCancelRequest = true;

    // response.body.supportsGotoTargetsRequest = true;

    this.sendResponse(response);

    // since this debug adapter can accept configuration requests like 'setBreakpoint' at any time,
    // we request them early by sending an 'initializeRequest' to the frontend.
    // The frontend will end the configuration sequence by calling 'configurationDone' request.
    this.sendEvent(new InitializedEvent());
  }

  /**
   * Called at the end of the configuration sequence.
   * Indicates that all breakpoints etc. have been sent to the DA and that the 'launch' can start.
   */
  protected override configurationDoneRequest(
    response: DebugProtocol.ConfigurationDoneResponse,
    args: DebugProtocol.ConfigurationDoneArguments
  ): void {
    // console.log("configurationDoneRequest", args);
    super.configurationDoneRequest(response, args);
    this._configurationDone = true;
    // notify the launchRequest that configuration has finished
    for (const listener of this._configurationDoneListeners) {
      listener();
    }
    this._configurationDoneListeners.clear();
  }

  protected override async disconnectRequest(
    response: DebugProtocol.DisconnectResponse,
    args: DebugProtocol.DisconnectArguments,
    request?: DebugProtocol.Request
  ) {
    // console.log("disconnectRequest", args);
    if (args.restart) {
      await this._fileAccessor.setSelectedLine(
        this._launchProgram,
        this._launchLine
      );
    }
    await this._connection.emit(
      StopGameMessage.type.request({
        restart: args.restart,
        suspend: args.suspendDebuggee,
        terminate: args.terminateDebuggee,
      })
    );
    this.sendResponse(response);
  }

  protected override async attachRequest(
    response: DebugProtocol.AttachResponse,
    args: IAttachRequestArguments
  ) {
    // console.log("attachRequest", args);
    return this.launchRequest(response, args);
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: ILaunchRequestArguments
  ) {
    // console.log("launchRequest", args);
    // make sure to 'Stop' the buffered logging if 'trace' is not set
    logger.setup(
      args.trace ? Logger.LogLevel.Verbose : Logger.LogLevel.Stop,
      false
    );

    if (!this._configurationDone) {
      // wait until configuration has finished (and configurationDoneRequest has been called)
      await new Promise<void>((resolve) => {
        this._configurationDoneListeners.add(resolve);
      });
    }

    await this._fileAccessor.showFile(args.program);

    this._launchProgram = args.program;
    this._launchLine =
      (await this._fileAccessor.getSelectedLine(args.program)) ?? 0;

    response.success = true;

    this.sendResponse(response);
  }

  protected override async pauseRequest(
    response: DebugProtocol.PauseResponse,
    args: DebugProtocol.PauseArguments,
    request?: DebugProtocol.Request
  ) {
    await this._connection.emit(PauseGameMessage.type.request({}));
    this.sendResponse(response);
    this.sendStoppedEvent("pause");
  }

  protected override async continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ) {
    // console.log("continueRequest", args);
    await this._connection.emit(UnpauseGameMessage.type.request({}));
    await this._connection.emit(ContinueGameMessage.type.request({}));
    this.sendResponse(response);
  }

  protected override async reverseContinueRequest(
    response: DebugProtocol.ReverseContinueResponse,
    args: DebugProtocol.ReverseContinueArguments
  ) {
    // console.log("reverseContinueRequest", args);
    // TODO
    this.sendResponse(response);
  }

  protected override async nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments
  ) {
    // console.log("nextRequest", args);
    await this._connection.emit(
      StepGameMessage.type.request({
        traversal: "over",
      })
    );
    this.sendResponse(response);
  }

  protected override async stepInRequest(
    response: DebugProtocol.StepInResponse,
    args: DebugProtocol.StepInArguments
  ) {
    // console.log("stepInRequest", args);
    await this._connection.emit(
      StepGameMessage.type.request({
        traversal: "in",
      })
    );
    this.sendResponse(response);
  }

  protected override async stepOutRequest(
    response: DebugProtocol.StepOutResponse,
    args: DebugProtocol.StepOutArguments
  ) {
    // console.log("stepOutRequest", args);
    await this._connection.emit(
      StepGameMessage.type.request({
        traversal: "out",
      })
    );
    this.sendResponse(response);
  }

  protected override async stepBackRequest(
    response: DebugProtocol.StepBackResponse,
    args: DebugProtocol.StepBackArguments
  ) {
    // console.log("stepBackRequest", args);
    // TODO
    this.sendResponse(response);
  }

  protected override stepInTargetsRequest(
    response: DebugProtocol.StepInTargetsResponse,
    args: DebugProtocol.StepInTargetsArguments
  ) {
    // console.log("stepInTargetsRequest", args);
    // TODO ?
    // const targets = this._mockRuntime.getStepInTargets(args.frameId);
    // response.body = {
    //   targets: targets.map((t) => {
    //     return { id: t.id, label: t.label };
    //   }),
    // };
    this.sendResponse(response);
  }

  protected override async loadedSourcesRequest(
    response: DebugProtocol.LoadedSourcesResponse,
    args: DebugProtocol.LoadedSourcesArguments
  ) {
    // console.log("loadedSourcesRequest", args);
    const { uris } = await this._connection.emit(
      GetGameScriptsMessage.type.request({})
    );
    response.body = {
      sources: uris.map((uri) =>
        this.createSource(this._fileAccessor.uriToPath(uri))
      ),
    };
    this.sendResponse(response);
  }

  protected override async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    // console.log("setBreakPointsRequest", args);

    const setBreakpoints: {
      file: string;
      line: number;
    }[] = [];

    if (args.breakpoints) {
      for (const b of args.breakpoints) {
        setBreakpoints.push({
          file: this._fileAccessor.pathToUri(args.source.path || ""),
          line: this.convertClientLineToDebugger(b.line),
        });
      }
    }

    const { breakpoints } = await this._connection.emit(
      ConfigureGameMessage.type.request({
        breakpoints: setBreakpoints,
      })
    );

    // send back the actual breakpoint positions
    response.body = {
      breakpoints: (breakpoints || []).map((b) => ({
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
                b.location.range.start.character
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
    request?: DebugProtocol.Request
  ) {
    // console.log("setFunctionBreakPointsRequest", args);

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
      ConfigureGameMessage.type.request({
        functionBreakpoints: setFunctionBreakpoints,
      })
    );

    // send back the actual breakpoint positions
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
                b.location.range.start.character
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
    request?: DebugProtocol.Request
  ) {
    // console.log("breakpointLocationsRequest", args);

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
                args.endColumn ?? args.column ?? 1
              ),
            },
          },
        },
      })
    );

    // send back the possible breakpoint positions
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
    args: DebugProtocol.SetExceptionBreakpointsArguments
  ): Promise<void> {
    // console.log("setExceptionBreakPointsRequest", args);
    // let namedException: string | undefined = undefined;
    // let otherExceptions = false;

    // if (args.filterOptions) {
    //   for (const filterOption of args.filterOptions) {
    //     switch (filterOption.filterId) {
    //       case "namedException":
    //         namedException = args.filterOptions[0]!.condition;
    //         break;
    //       case "otherExceptions":
    //         otherExceptions = true;
    //         break;
    //     }
    //   }
    // }

    // if (args.filters) {
    //   if (args.filters.indexOf("otherExceptions") >= 0) {
    //     otherExceptions = true;
    //   }
    // }

    // this._mockRuntime.setExceptionsFilters(namedException, otherExceptions);

    this.sendResponse(response);
  }

  protected override exceptionInfoRequest(
    response: DebugProtocol.ExceptionInfoResponse,
    args: DebugProtocol.ExceptionInfoArguments
  ) {
    // console.log("exceptionInfoRequest", args);
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
    response: DebugProtocol.ThreadsResponse
  ) {
    const { threads } = await this._connection.emit(
      GetGameThreadsMessage.type.request({})
    );
    // console.log("threadsRequest", threads);
    response.body = {
      threads,
    };
    this.sendResponse(response);
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ) {
    // console.warn("stackTraceRequest", args.threadId);
    this._variableHandles.reset();
    const { stackFrames, totalFrames } = await this._connection.emit(
      GetGameStackTraceMessage.type.request({
        threadId: args.threadId,
        startFrame: args.startFrame,
        levels: args.levels,
      })
    );
    const clientStackFrames: StackFrame[] = [];
    for (const stackFrame of stackFrames) {
      const clientStackFrame: StackFrame = {
        ...stackFrame,
        source: this.createSource(
          this._fileAccessor.uriToPath(stackFrame.location.uri)
        ),
        line: this.convertDebuggerLineToClient(
          stackFrame.location.range.start.line
        ),
        column: this.convertDebuggerColumnToClient(
          stackFrame.location.range.start.character
        ),
        endLine: this.convertDebuggerLineToClient(
          stackFrame.location.range.end.line
        ),
        endColumn: this.convertDebuggerColumnToClient(
          stackFrame.location.range.end.character
        ),
      };
      clientStackFrames.push(clientStackFrame);
    }
    response.body = {
      stackFrames: clientStackFrames,
      totalFrames,
    };
    this.sendResponse(response);
  }

  protected override scopesRequest(
    response: DebugProtocol.ScopesResponse,
    args: DebugProtocol.ScopesArguments
  ): void {
    // console.log("scopesRequest", args);
    response.body = {
      scopes: [
        new Scope("Temps", this._variableHandles.create("temps"), false),
        new Scope("Vars", this._variableHandles.create("vars"), false),
        new Scope("Lists", this._variableHandles.create("lists"), false),
        new Scope("Defines", this._variableHandles.create("defines"), true),
      ],
    };
    this.sendResponse(response);
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
    request?: DebugProtocol.Request
  ): Promise<void> {
    // console.log("variablesRequest", args);

    let vars: Variable[] = [];

    const scope = this._variableHandles.get(args.variablesReference);
    if (scope === "temps") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "temps",
        })
      );
      vars = variables;
    } else if (scope === "vars") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "vars",
        })
      );
      vars = variables;
    } else if (scope === "lists") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "lists",
          variablesReference: args.variablesReference,
        })
      );
      vars = variables;
    } else if (scope === "defines") {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "defines",
          variablesReference: args.variablesReference,
        })
      );
      vars = variables;
    } else {
      const { variables } = await this._connection.emit(
        GetGameVariablesMessage.type.request({
          scope: "children",
          variablesReference: args.variablesReference,
        })
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
    args: DebugProtocol.EvaluateArguments
  ): Promise<void> {
    // console.log("evaluateRequest", args);

    const { context } = await this._connection.emit(
      GetGameEvaluationContextMessage.type.request({})
    );

    const compiler = new SparkdownCompiler();
    const value = compiler.evaluate(args.expression, context);

    const { variables } = await this._connection.emit(
      GetGameVariablesMessage.type.request({
        scope: "value",
        value,
      })
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
    args: DebugProtocol.SetVariableArguments
  ) {
    // console.log("setVariableRequest", args);

    this.sendResponse(response);
  }

  protected override async dataBreakpointInfoRequest(
    response: DebugProtocol.DataBreakpointInfoResponse,
    args: DebugProtocol.DataBreakpointInfoArguments
  ) {
    // console.log("dataBreakpointInfoRequest", args);

    response.body = {
      dataId: null,
      description: "Cannot break on data",
      accessTypes: undefined,
      canPersist: false,
    };

    // NOTE: we currently don't support "read" or "readWrite" breakpoints

    if (args.variablesReference && args.name) {
      const scope = this._variableHandles.get(args.variablesReference);
      if (scope === "temps") {
        const { variables } = await this._connection.emit(
          GetGameVariablesMessage.type.request({
            scope: "temps",
          })
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
          })
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
    args: DebugProtocol.SetDataBreakpointsArguments
  ) {
    // console.log("setDataBreakpointsRequest", args);

    const { dataBreakpoints } = await this._connection.emit(
      ConfigureGameMessage.type.request({
        dataBreakpoints: args.breakpoints,
      })
    );

    // send back the actual breakpoint positions
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
                b.location.range.start.character
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
    args: DebugProtocol.SetExpressionArguments
  ): void {
    // console.log("setExpressionRequest", args);
    // if (args.expression.startsWith("$")) {
    //   const rv = this._mockRuntime.getLocalVariable(args.expression.substr(1));
    //   if (rv) {
    //     rv.value = this.convertToRuntime(args.value);
    //     response.body = this.convertFromRuntime(rv);
    //     this.sendResponse(response);
    //   } else {
    //     this.sendErrorResponse(response, {
    //       id: 1002,
    //       format: `variable '{lexpr}' not found`,
    //       variables: { lexpr: args.expression },
    //       showUser: true,
    //     });
    //   }
    // } else {
    //   this.sendErrorResponse(response, {
    //     id: 1003,
    //     format: `'{lexpr}' not an assignable expression`,
    //     variables: { lexpr: args.expression },
    //     showUser: true,
    //   });
    // }
    this.sendResponse(response);
  }

  private async progressSequence() {
    const ID = "" + this._progressId++;

    await timeout(100);

    const title = this._isProgressCancellable
      ? "Cancellable operation"
      : "Long running operation";
    const startEvent: DebugProtocol.ProgressStartEvent = new ProgressStartEvent(
      ID,
      title
    );
    startEvent.body.cancellable = this._isProgressCancellable;
    this._isProgressCancellable = !this._isProgressCancellable;
    this.sendEvent(startEvent);
    this.sendEvent(new OutputEvent(`start progress: ${ID}\n`));

    let endMessage = "progress ended";

    for (let i = 0; i < 100; i++) {
      await timeout(500);
      this.sendEvent(new ProgressUpdateEvent(ID, `progress: ${i}`));
      if (this._cancelledProgressId === ID) {
        endMessage = "progress cancelled";
        this._cancelledProgressId = undefined;
        this.sendEvent(new OutputEvent(`cancel progress: ${ID}\n`));
        break;
      }
    }
    this.sendEvent(new ProgressEndEvent(ID, endMessage));
    this.sendEvent(new OutputEvent(`end progress: ${ID}\n`));

    this._cancelledProgressId = undefined;
  }

  protected override cancelRequest(
    response: DebugProtocol.CancelResponse,
    args: DebugProtocol.CancelArguments
  ) {
    // console.log("cancelRequest", args);
    // if (args.requestId) {
    //   this._cancellationTokens.set(args.requestId, true);
    // }
    // if (args.progressId) {
    //   this._cancelledProgressId = args.progressId;
    // }
  }

  protected override customRequest(
    command: string,
    response: DebugProtocol.Response,
    args: any
  ) {
    if (command === "toggleFormatting") {
      this._valuesInHex = !this._valuesInHex;
      if (this._useInvalidatedEvent) {
        this.sendEvent(new InvalidatedEvent(["variables"]));
      }
      this.sendResponse(response);
    } else {
      super.customRequest(command, response, args);
    }
  }

  //---- helpers

  private createSource(filePath: string): Source {
    // TODO: name should be path relative to workspace root
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
      "sparkdown"
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
