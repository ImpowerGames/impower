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
import { GetGamePossibleBreakpointLocationsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGamePossibleBreakpointLocationsMessage";
import { GetGameStackTraceMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameStackTraceMessage";
import { GetGameThreadsMessage } from "@impower/spark-editor-protocol/src/protocols/game/GetGameThreadsMessage";
import { StartGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StartGameMessage";
import { StepGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StepGameMessage";
import { StopGameMessage } from "@impower/spark-editor-protocol/src/protocols/game/StopGameMessage";
import {
  NotificationMessage,
  RequestMessage,
  ResponseError,
} from "@impower/spark-engine/src/game/core";
import { Connection } from "@impower/spark-engine/src/game/core/classes/Connection";
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
} from "@vscode/debugadapter";
import { DebugProtocol } from "@vscode/debugprotocol";
import * as base64 from "base64-js";
import { IRuntimeVariableType, RuntimeVariable, timeout } from "./mockRuntime";

export interface FileAccessor {
  isWindows: boolean;
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, contents: Uint8Array): Promise<void>;
  showFile(path: string): Promise<void>;
  pathToUri(path: string): string;
  uriToPath(uri: string): string;
  getRootPath(path: string): string | undefined;
}

export interface DebugAccessor {
  continue(): void;
  stepOver(): void;
  stepInto(): void;
  stepOut(): void;
  stepBack(): void;
  reverse(): void;
  restart(): void;
  stop(): void;
}

export interface IRuntimeStackFrame {
  index: number;
  name: string;
  file: string;
  line: number;
  column?: number;
  instruction?: number;
}

export interface RuntimeStack {
  count: number;
  frames: IRuntimeStackFrame[];
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
  /** if specified, results in a simulated compile error in launch. */
  compileError?: "default" | "show" | "hide";
}

interface IAttachRequestArguments extends ILaunchRequestArguments {}

export class SparkDebugSession extends LoggingDebugSession {
  private _fileAccessor: FileAccessor;

  private _debugAccessor: DebugAccessor;

  private _connection: Connection;

  private _variableHandles = new Handles<
    "locals" | "globals" | RuntimeVariable
  >();

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
  public constructor(
    fileAccessor: FileAccessor,
    debugAccessor: DebugAccessor,
    connection: Connection
  ) {
    super("mock-debug.txt");

    this._fileAccessor = fileAccessor;
    this._debugAccessor = debugAccessor;

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
    return new Promise((callback) => {
      if ("id" in msg) {
        this.onReceiveRequest(msg).then((response) => {
          if (response) {
            callback(response as any);
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

    // the adapter implements the configurationDone request.
    response.body.supportsConfigurationDoneRequest = true;

    // make VS Code use 'evaluate' when hovering over source
    response.body.supportsEvaluateForHovers = true;

    // make VS Code show a 'step back' button
    // response.body.supportsStepBack = true;

    // make VS Code support data breakpoints
    // response.body.supportsDataBreakpoints = true;

    // make VS Code support completion in REPL
    response.body.supportsCompletionsRequest = true;
    response.body.completionTriggerCharacters = [".", "["];

    // make VS Code send cancel request
    response.body.supportsCancelRequest = true;

    // make VS Code send the breakpointLocations request
    response.body.supportsBreakpointLocationsRequest = true;

    // make VS Code provide "Step in Target" functionality
    response.body.supportsStepInTargetsRequest = true;

    // the adapter defines two exceptions filters, one with support for conditions.
    response.body.supportsExceptionFilterOptions = true;
    response.body.exceptionBreakpointFilters = [
      {
        filter: "namedException",
        label: "Named Exception",
        description: `Break on named exceptions. Enter the exception's name as the Condition.`,
        default: false,
        supportsCondition: true,
        conditionDescription: `Enter the exception's name`,
      },
      {
        filter: "otherExceptions",
        label: "Other Exceptions",
        description: "This is a other exception",
        default: true,
        supportsCondition: false,
      },
    ];

    // make VS Code send exceptionInfo request
    response.body.supportsExceptionInfoRequest = true;

    // make VS Code send setVariable request
    response.body.supportsSetVariable = true;

    // make VS Code send setExpression request
    response.body.supportsSetExpression = true;

    // make VS Code send disassemble request
    // response.body.supportsDisassembleRequest = true;
    // response.body.supportsSteppingGranularity = true;
    // response.body.supportsInstructionBreakpoints = true;

    // make VS Code able to read and write variable memory
    // response.body.supportsReadMemoryRequest = true;
    // response.body.supportsWriteMemoryRequest = true;

    response.body.supportSuspendDebuggee = true;
    response.body.supportTerminateDebuggee = true;
    response.body.supportsFunctionBreakpoints = true;

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
    console.log("configurationDoneRequest", args);
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
    console.log("disconnectRequest", args);
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
    console.log("attachRequest", args);
    return this.launchRequest(response, args);
  }

  protected override async launchRequest(
    response: DebugProtocol.LaunchResponse,
    args: ILaunchRequestArguments
  ) {
    console.log("launchRequest", args);
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

    // start the program in the runtime
    const success = await this._connection.emit(
      StartGameMessage.type.request({
        stopOnEntry: Boolean(args.stopOnEntry),
        debug: !args.noDebug,
      })
    );

    if (success) {
      this.sendResponse(response);
    } else {
      // simulate a compile/build error in "launch" request:
      // the error should not result in a modal dialog since 'showUser' is set to false.
      // A missing 'showUser' should result in a modal dialog.
      this.sendErrorResponse(response, {
        id: 1001,
        format: `The program contains errors that prevent it from being compiled`,
        showUser:
          args.compileError === "show"
            ? true
            : args.compileError === "hide"
            ? false
            : undefined,
      });
    }
  }

  protected override async continueRequest(
    response: DebugProtocol.ContinueResponse,
    args: DebugProtocol.ContinueArguments
  ) {
    console.log("continueRequest", args);
    await this._connection.emit(ContinueGameMessage.type.request({}));
    this.sendResponse(response);
  }

  protected override async reverseContinueRequest(
    response: DebugProtocol.ReverseContinueResponse,
    args: DebugProtocol.ReverseContinueArguments
  ) {
    console.log("reverseContinueRequest", args);
    // TODO
    this.sendResponse(response);
  }

  protected override async nextRequest(
    response: DebugProtocol.NextResponse,
    args: DebugProtocol.NextArguments
  ) {
    console.log("nextRequest", args);
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
    console.log("stepInRequest", args);
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
    console.log("stepOutRequest", args);
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
    console.log("stepBackRequest", args);
    // TODO
    this.sendResponse(response);
  }

  protected override stepInTargetsRequest(
    response: DebugProtocol.StepInTargetsResponse,
    args: DebugProtocol.StepInTargetsArguments
  ) {
    console.log("stepInTargetsRequest", args);
    // TODO ?
    // const targets = this._mockRuntime.getStepInTargets(args.frameId);
    // response.body = {
    //   targets: targets.map((t) => {
    //     return { id: t.id, label: t.label };
    //   }),
    // };
    this.sendResponse(response);
  }

  protected override async setBreakPointsRequest(
    response: DebugProtocol.SetBreakpointsResponse,
    args: DebugProtocol.SetBreakpointsArguments
  ): Promise<void> {
    console.log("setBreakPointsRequest", args);

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
    console.log("setFunctionBreakPointsRequest", args);

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
    console.log("breakpointLocationsRequest", args);

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
    console.log("setExceptionBreakPointsRequest", args);
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
    console.log("exceptionInfoRequest", args);
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
    console.log("threadsRequest", threads);
    response.body = {
      threads,
    };
    this.sendResponse(response);
  }

  protected override async stackTraceRequest(
    response: DebugProtocol.StackTraceResponse,
    args: DebugProtocol.StackTraceArguments
  ) {
    console.warn("stackTraceRequest", args.threadId);
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
    console.log("scopesRequest", args);
    response.body = {
      scopes: [
        new Scope("Locals", this._variableHandles.create("locals"), false),
        new Scope("Globals", this._variableHandles.create("globals"), true),
      ],
    };
    this.sendResponse(response);
  }

  protected override async writeMemoryRequest(
    response: DebugProtocol.WriteMemoryResponse,
    { data, memoryReference, offset = 0 }: DebugProtocol.WriteMemoryArguments
  ) {
    console.log("writeMemoryRequest");
    const variable = this._variableHandles.get(Number(memoryReference));
    if (typeof variable === "object") {
      const decoded = base64.toByteArray(data);
      variable.setMemory(decoded, offset);
      response.body = { bytesWritten: decoded.length };
    } else {
      response.body = { bytesWritten: 0 };
    }

    this.sendResponse(response);
    this.sendEvent(new InvalidatedEvent(["variables"]));
  }

  protected override async readMemoryRequest(
    response: DebugProtocol.ReadMemoryResponse,
    { offset = 0, count, memoryReference }: DebugProtocol.ReadMemoryArguments
  ) {
    console.log("readMemoryRequest");
    const variable = this._variableHandles.get(Number(memoryReference));
    if (typeof variable === "object" && variable.memory) {
      const memory = variable.memory.subarray(
        Math.min(offset, variable.memory.length),
        Math.min(offset + count, variable.memory.length)
      );

      response.body = {
        address: offset.toString(),
        data: base64.fromByteArray(memory),
        unreadableBytes: count - memory.length,
      };
    } else {
      response.body = {
        address: offset.toString(),
        data: "",
        unreadableBytes: count,
      };
    }

    this.sendResponse(response);
  }

  protected override async variablesRequest(
    response: DebugProtocol.VariablesResponse,
    args: DebugProtocol.VariablesArguments,
    request?: DebugProtocol.Request
  ): Promise<void> {
    console.log("variablesRequest", args);
    // let vs: RuntimeVariable[] = [];

    // const v = this._variableHandles.get(args.variablesReference);
    // if (v === "locals") {
    //   vs = this._mockRuntime.getLocalVariables();
    // } else if (v === "globals") {
    //   if (request) {
    //     this._cancellationTokens.set(request.seq, false);
    //     vs = await this._mockRuntime.getGlobalVariables(
    //       () => !!this._cancellationTokens.get(request.seq)
    //     );
    //     this._cancellationTokens.delete(request.seq);
    //   } else {
    //     vs = await this._mockRuntime.getGlobalVariables();
    //   }
    // } else if (v && Array.isArray(v.value)) {
    //   vs = v.value;
    // }

    // response.body = {
    //   variables: vs.map((v) => this.convertFromRuntime(v)),
    // };
    this.sendResponse(response);
  }

  protected override setVariableRequest(
    response: DebugProtocol.SetVariableResponse,
    args: DebugProtocol.SetVariableArguments
  ): void {
    console.log("setVariableRequest", args);
    // const container = this._variableHandles.get(args.variablesReference);
    // const rv =
    //   container === "locals"
    //     ? this._mockRuntime.getLocalVariable(args.name)
    //     : container instanceof RuntimeVariable &&
    //       container.value instanceof Array
    //     ? container.value.find((v) => v.name === args.name)
    //     : undefined;

    // if (rv) {
    //   rv.value = this.convertToRuntime(args.value);
    //   response.body = this.convertFromRuntime(rv);

    //   if (rv.memory && rv.reference) {
    //     this.sendEvent(
    //       new MemoryEvent(String(rv.reference), 0, rv.memory.length)
    //     );
    //   }
    // }

    this.sendResponse(response);
  }

  protected override async evaluateRequest(
    response: DebugProtocol.EvaluateResponse,
    args: DebugProtocol.EvaluateArguments
  ): Promise<void> {
    console.log("evaluateRequest", args);
    // let reply: string | undefined;
    // let rv: RuntimeVariable | undefined;

    // switch (args.context) {
    //   case "repl":
    //     // handle some REPL commands:
    //     // 'evaluate' supports to create and delete breakpoints from the 'repl':
    //     const matches = /new +([0-9]+)/.exec(args.expression);
    //     if (matches && matches.length === 2) {
    //       const mbp = await this._mockRuntime.setBreakPoint(
    //         this._mockRuntime.sourceFile,
    //         this.convertClientLineToDebugger(parseInt(matches[1]!))
    //       );
    //       const bp = new Breakpoint(
    //         mbp.verified,
    //         this.convertDebuggerLineToClient(mbp.line),
    //         undefined,
    //         this.createSource(this._mockRuntime.sourceFile)
    //       ) as DebugProtocol.Breakpoint;
    //       bp.id = mbp.id;
    //       this.sendEvent(new BreakpointEvent("new", bp));
    //       reply = `breakpoint created`;
    //     } else {
    //       const matches = /del +([0-9]+)/.exec(args.expression);
    //       if (matches && matches.length === 2) {
    //         const mbp = this._mockRuntime.clearBreakPoint(
    //           this._mockRuntime.sourceFile,
    //           this.convertClientLineToDebugger(parseInt(matches[1]!))
    //         );
    //         if (mbp) {
    //           const bp = new Breakpoint(false) as DebugProtocol.Breakpoint;
    //           bp.id = mbp.id;
    //           this.sendEvent(new BreakpointEvent("removed", bp));
    //           reply = `breakpoint deleted`;
    //         }
    //       } else {
    //         const matches = /progress/.exec(args.expression);
    //         if (matches && matches.length === 1) {
    //           if (this._reportProgress) {
    //             reply = `progress started`;
    //             this.progressSequence();
    //           } else {
    //             reply = `frontend doesn't support progress (capability 'supportsProgressReporting' not set)`;
    //           }
    //         }
    //       }
    //     }
    //   // fall through

    //   default:
    //     if (args.expression.startsWith("$")) {
    //       rv = this._mockRuntime.getLocalVariable(args.expression.substr(1));
    //     } else {
    //       rv = new RuntimeVariable(
    //         "eval",
    //         this.convertToRuntime(args.expression)
    //       );
    //     }
    //     break;
    // }

    // if (rv) {
    //   const v = this.convertFromRuntime(rv);
    //   response.body = {
    //     result: v.value,
    //     type: v.type,
    //     variablesReference: v.variablesReference,
    //     presentationHint: v.presentationHint,
    //   };
    // } else {
    //   response.body = {
    //     result: reply
    //       ? reply
    //       : `evaluate(context: '${args.context}', '${args.expression}')`,
    //     variablesReference: 0,
    //   };
    // }

    this.sendResponse(response);
  }

  protected override setExpressionRequest(
    response: DebugProtocol.SetExpressionResponse,
    args: DebugProtocol.SetExpressionArguments
  ): void {
    console.log("setExpressionRequest", args);
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

  protected override dataBreakpointInfoRequest(
    response: DebugProtocol.DataBreakpointInfoResponse,
    args: DebugProtocol.DataBreakpointInfoArguments
  ): void {
    console.log("dataBreakpointInfoRequest", args);
    // response.body = {
    //   dataId: null,
    //   description: "cannot break on data access",
    //   accessTypes: undefined,
    //   canPersist: false,
    // };

    // if (args.variablesReference && args.name) {
    //   const v = this._variableHandles.get(args.variablesReference);
    //   if (v === "globals") {
    //     response.body.dataId = args.name;
    //     response.body.description = args.name;
    //     response.body.accessTypes = ["write"];
    //     response.body.canPersist = true;
    //   } else {
    //     response.body.dataId = args.name;
    //     response.body.description = args.name;
    //     response.body.accessTypes = ["read", "write", "readWrite"];
    //     response.body.canPersist = true;
    //   }
    // }

    this.sendResponse(response);
  }

  protected override setDataBreakpointsRequest(
    response: DebugProtocol.SetDataBreakpointsResponse,
    args: DebugProtocol.SetDataBreakpointsArguments
  ): void {
    console.log("setDataBreakpointsRequest", args);
    // // clear all data breakpoints
    // this._mockRuntime.clearAllDataBreakpoints();

    // response.body = {
    //   breakpoints: [],
    // };

    // for (const dbp of args.breakpoints) {
    //   const ok = this._mockRuntime.setDataBreakpoint(
    //     dbp.dataId,
    //     dbp.accessType || "write"
    //   );
    //   response.body.breakpoints.push({
    //     verified: ok,
    //   });
    // }

    this.sendResponse(response);
  }

  protected override completionsRequest(
    response: DebugProtocol.CompletionsResponse,
    args: DebugProtocol.CompletionsArguments
  ): void {
    // response.body = {
    //   targets: [
    //     {
    //       label: "item 10",
    //       sortText: "10",
    //     },
    //     {
    //       label: "item 1",
    //       sortText: "01",
    //       detail: "detail 1",
    //     },
    //     {
    //       label: "item 2",
    //       sortText: "02",
    //       detail: "detail 2",
    //     },
    //     {
    //       label: "array[]",
    //       selectionStart: 6,
    //       sortText: "03",
    //     },
    //     {
    //       label: "func(arg)",
    //       selectionStart: 5,
    //       selectionLength: 3,
    //       sortText: "04",
    //     },
    //   ],
    // };
    this.sendResponse(response);
  }

  protected override cancelRequest(
    response: DebugProtocol.CancelResponse,
    args: DebugProtocol.CancelArguments
  ) {
    console.log("cancelRequest", args);
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

  private convertToRuntime(value: string): IRuntimeVariableType {
    value = value.trim();

    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    if (value[0] === "'" || value[0] === '"') {
      return value.substr(1, value.length - 2);
    }
    const n = parseFloat(value);
    if (!isNaN(n)) {
      return n;
    }
    return value;
  }

  private convertFromRuntime(v: RuntimeVariable): DebugProtocol.Variable {
    let dapVariable: DebugProtocol.Variable = {
      name: v.name,
      value: "???",
      type: typeof v.value,
      variablesReference: 0,
      evaluateName: "$" + v.name,
    };

    if (v.name.indexOf("lazy") >= 0) {
      // a "lazy" variable needs an additional click to retrieve its value

      dapVariable.value = "lazy var"; // placeholder value
      v.reference ??= this._variableHandles.create(
        new RuntimeVariable("", [new RuntimeVariable("", v.value)])
      );
      dapVariable.variablesReference = v.reference;
      dapVariable.presentationHint = { lazy: true };
    } else {
      if (Array.isArray(v.value)) {
        dapVariable.value = "Object";
        v.reference ??= this._variableHandles.create(v);
        dapVariable.variablesReference = v.reference;
      } else {
        switch (typeof v.value) {
          case "number":
            if (Math.round(v.value) === v.value) {
              dapVariable.value = this.formatNumber(v.value);
              (<any>dapVariable).__vscodeVariableMenuContext = "simple"; // enable context menu contribution
              dapVariable.type = "integer";
            } else {
              dapVariable.value = v.value.toString();
              dapVariable.type = "float";
            }
            break;
          case "string":
            dapVariable.value = `"${v.value}"`;
            break;
          case "boolean":
            dapVariable.value = v.value ? "true" : "false";
            break;
          default:
            dapVariable.value = typeof v.value;
            break;
        }
      }
    }

    if (v.memory) {
      v.reference ??= this._variableHandles.create(v);
      dapVariable.memoryReference = String(v.reference);
    }

    return dapVariable;
  }

  private formatNumber(x: number) {
    return this._valuesInHex ? "0x" + x.toString(16) : x.toString(10);
  }

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
