import { PushPopType } from "@impower/sparkdown/src/inkjs/engine/PushPop";
import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { Breakpoint } from "../types/Breakpoint";
import { DocumentLocation } from "../types/DocumentLocation";
import { ErrorType } from "../types/ErrorType";
import { GameContext } from "../types/GameContext";
import { InstanceMap } from "../types/InstanceMap";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { StackFrame } from "../types/StackFrame";
import { Thread } from "../types/Thread";
import { evaluate } from "../utils/evaluate";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { Module } from "./Module";
import { AutoAdvancedToContinueMessage } from "./messages/AutoAdvancedToContinueMessage";
import { AwaitingInteractionMessage } from "./messages/AwaitingInteractionMessage";
import { ChosePathToContinueMessage } from "./messages/ChoosePathToContinueMessage";
import { ClickedToContinueMessage } from "./messages/ClickedToContinueMessage";
import { ContinuedMessage } from "./messages/ContinuedMessage";
import { ExitedThreadMessage } from "./messages/ExitedThreadMessage";
import { FinishedMessage } from "./messages/FinishedMessage";
import { HitBreakpointMessage } from "./messages/HitBreakpointMessage";
import { RuntimeErrorMessage } from "./messages/RuntimeErrorMessage";
import { StartedThreadMessage } from "./messages/StartedThreadMessage";
import { SteppedMessage } from "./messages/SteppedMessage";

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export type M = { [name: string]: Module };

export type ScriptLocation = [
  scriptIndex: number,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number
];

export class Game<T extends M = {}> {
  protected _destroyed = false;

  protected _context: GameContext = {} as GameContext;
  get context() {
    return this._context;
  }

  protected _stored: string[] = [];
  public get stored() {
    return this._stored;
  }

  protected _modules: Record<string, Module> = {};
  get module() {
    return this._modules as GameModules & T;
  }

  protected _moduleNames: string[];

  protected _connection: Connection;
  get connection() {
    return this._connection;
  }

  protected _story: Story;

  protected _scripts: string[];

  protected _instructionLocations: ScriptLocation[];

  protected _coordinator: Coordinator<typeof this> | null = null;

  protected _executionTimeout = 1000;

  protected _executingLocation: ScriptLocation;

  protected _lastHitBreakpointLocation?: ScriptLocation;

  protected _startpoint: {
    file: string;
    line: number;
  };

  protected _breakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _functionBreakpointMap: Record<number, Map<number, Breakpoint>> =
    {};

  protected _state: "initial" | "previewing" | "running" | "paused" = "initial";
  get state() {
    return this._state;
  }

  protected _debugging = false;
  get debugging() {
    return this._debugging;
  }

  protected _program: SparkProgram;
  get program() {
    return this._program;
  }

  constructor(
    program: SparkProgram,
    options?: {
      executionTimeout?: number;
      preview?: { file: string; line: number };
      startpoint?: { file: string; line: number };
      breakpoints?: { file: string; line: number }[];
      functionBreakpoints?: { name: string }[];
      modules?: {
        [name in keyof T]: abstract new (...args: any) => T[name];
      };
    }
  ) {
    this._program = program;

    if (!this._program.compiled) {
      throw new Error(
        "Program must be successfully compiled before it can be run"
      );
    }

    this._instructionLocations = Object.values(this._program.pathToLocation);

    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });

    this._scripts = Object.keys(this._program.scripts);
    const modules = options?.modules;
    const previewing = options?.preview ? true : undefined;
    this._state = previewing ? "previewing" : "initial";
    this._startpoint = options?.startpoint ?? {
      file: this._scripts[0] || this._program.uri,
      line: 0,
    };
    this.updateBreakpointsMap(options?.breakpoints ?? []);
    this.updateFunctionBreakpointsMap(options?.functionBreakpoints ?? []);
    if (options?.executionTimeout) {
      this._executionTimeout = options.executionTimeout;
    }

    // Create story to control flow and state
    this._story = new Story(this._program.compiled);
    this._story.onError = (message: string, type: ErrorType) => {
      this.Error(message, type);
    };
    // Create context
    this._context = {
      system: {
        previewing,
        initialized: false,
        transitions: true,
        checkpoint: () => this.checkpoint(),
        uuid: () => uuid(),
        supports: (module: string) => this.supports(module),
        setTimeout: () => {
          throw new Error("setTimeout not configured");
        },
      },
      ...(this._program.context || {}),
    };
    // Override default modules with custom ones if specified
    const allModules = {
      ...modules, // custom modules should be first in call order
      ...DEFAULT_MODULES,
      ...modules, // custom modules should override default modules if specified
    };
    const moduleNames = Object.keys(allModules);
    // Instantiate all modules
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const ctr = allModules[name];
      if (ctr) {
        this._modules[name] = new ctr(this);
      }
    }
    // Register builtins of all modules
    for (const key of moduleNames) {
      const name = key as keyof typeof allModules;
      const module = this._modules[name];
      if (module) {
        const moduleStored = module.getStored();
        if (moduleStored) {
          this._stored.push(...moduleStored);
        }
      }
    }
    this._moduleNames = moduleNames;

    this._executingLocation = [0, 0, 0, 0, 0];
  }

  getClosestPath(file: string | undefined, line: number | undefined) {
    if (file == null) {
      return "0";
    }
    const fileIndex = this._scripts.indexOf(file);
    if (fileIndex < 0) {
      return "0";
    }
    if (!this._program.pathToLocation) {
      return "0";
    }
    if (line == null) {
      return "0";
    }
    if (file === this._program.uri && line === 0) {
      return "0";
    }
    const pathToLocationEntries = Object.entries(this._program.pathToLocation);
    let closestIndex = pathToLocationEntries.length - 1;
    for (let i = 0; i < pathToLocationEntries.length; i++) {
      const [, source] = pathToLocationEntries[i]!;
      const [currFileIndex, currLineIndex] = source;
      if (currFileIndex === fileIndex && currLineIndex === line) {
        closestIndex = i;
        break;
      }
      if (currFileIndex === fileIndex && currLineIndex > line) {
        closestIndex = i - 1;
        break;
      }
      if (currFileIndex > fileIndex) {
        closestIndex = i - 1;
        break;
      }
    }
    const match = pathToLocationEntries[closestIndex];
    if (match == null) {
      return "0";
    }
    const [path] = match;
    if (path == null) {
      return "0";
    }
    return path;
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async init(config: {
    send: (message: Message, transfer?: ArrayBuffer[]) => void;
    resolve: (path: string) => string;
    fetch: (url: string) => Promise<string | ArrayBuffer>;
    log: (message: unknown, severity: "info" | "warning" | "error") => void;
    setTimeout: (handler: Function, timeout?: number, ...args: any[]) => number;
  }): Promise<void> {
    this._connection.connectOutput(config.send);
    this._context.system.resolve = config.resolve;
    this._context.system.fetch = config.fetch;
    this._context.system.log = config.log;
    this._context.system.setTimeout = config.setTimeout;
    this._context.system.initialized = true;
    await Promise.all(this._moduleNames.map((k) => this._modules[k]?.onInit()));
  }

  setStartpoint(startpoint: { file: string; line: number }) {
    this._startpoint = startpoint;
  }

  setBreakpoints(breakpoints: { file: string; line: number }[]) {
    return this.updateBreakpointsMap(breakpoints);
  }

  setFunctionBreakpoints(functionBreakpoints: { name: string }[]) {
    return this.updateFunctionBreakpointsMap(functionBreakpoints);
  }

  updateBreakpointsMap(breakpoints: { file: string; line: number }[]) {
    const actualBreakpoints = Game.getActualBreakpoints(
      this._instructionLocations,
      breakpoints,
      this._scripts
    );
    const breakpointMap: Record<number, Map<number, Breakpoint>> = {};
    for (const b of actualBreakpoints) {
      if (b.location?.uri) {
        const scriptIndex = this._scripts.indexOf(b.location.uri);
        if (scriptIndex >= 0) {
          breakpointMap[scriptIndex] ??= new Map();
          if (b.location.range.start.line != null) {
            breakpointMap[scriptIndex].set(b.location.range.start.line, b);
          }
        }
      }
    }
    this._breakpointMap = breakpointMap;
    return actualBreakpoints;
  }

  updateFunctionBreakpointsMap(functionBreakpoints: { name: string }[]) {
    const actualBreakpoints = Game.getActualFunctionBreakpoints(
      this._program.functionLocations,
      functionBreakpoints,
      this._scripts
    );
    const breakpointMap: Record<number, Map<number, Breakpoint>> = {};
    for (const b of actualBreakpoints) {
      if (b.location?.uri) {
        const scriptIndex = this._scripts.indexOf(b.location.uri);
        if (scriptIndex >= 0) {
          breakpointMap[scriptIndex] ??= new Map();
          if (b.location.range.start.line != null) {
            breakpointMap[scriptIndex].set(b.location.range.start.line, b);
          }
        }
      }
    }
    this._functionBreakpointMap = breakpointMap;
    return actualBreakpoints;
  }

  start(save: string = ""): void {
    this._state = "running";
    this._context.system.previewing = undefined;
    if (save) {
      this.loadSave(save);
    } else {
      // Start story from startpoint
      const startpoint = this._startpoint;
      const startPath = this.getClosestPath(startpoint.file, startpoint.line);
      if (startPath) {
        this._story.ChoosePathString(startPath);
      }
    }
    this.continue();
    for (const k of this._moduleNames) {
      this._modules[k]?.onStart();
    }
  }

  update(deltaMS: number) {
    if (!this._destroyed) {
      for (const k of this._moduleNames) {
        this._modules[k]?.onUpdate(deltaMS);
      }
      if (this._coordinator) {
        this._coordinator.onUpdate(deltaMS);
      }
    }
  }

  async restore(): Promise<void> {
    await Promise.all(
      this._moduleNames.map((k) => this._modules[k]?.onRestore())
    );
  }

  destroy(): void {
    this._destroyed = true;
    for (const k of this._moduleNames) {
      this._modules[k]?.onDestroy();
    }
    this._moduleNames = [];
    this._connection.incoming.removeAllListeners();
    this._connection.outgoing.removeAllListeners();
    this._coordinator = null;
  }

  protected cache(cache: object, accessPath: string) {
    const value = evaluate(accessPath, this._context);
    if (value !== undefined && typeof value != "function") {
      setProperty(cache, accessPath, value);
    }
  }

  serialize(): string {
    const saveData: Record<string, any> & { context: any } = {
      context: {},
    };
    for (const accessPath of this._stored) {
      this.cache(saveData.context, accessPath);
    }
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.onSerialize();
        saveData[k] = module.state;
      }
    }
    const serialized = JSON.stringify(saveData);
    return serialized;
  }

  checkpoint(): void {
    for (const k of this._moduleNames) {
      this._modules[k]?.onCheckpoint();
    }
    // const storyState = this._story.state.ToJson();
    // const moduleState = this.serialize();
  }

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  > {
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        if ("id" in msg) {
          return module.onReceiveRequest(msg);
        }
        module.onReceiveNotification(msg);
      }
    }
    if (this._coordinator) {
      this._coordinator.onMessage(msg);
    }
    return undefined;
  }

  reset() {
    // Reset story to its initial state
    this._story.ResetState();
    // Notify modules about reset
    for (const k of this._moduleNames) {
      this._modules[k]?.onReset();
    }
  }

  restart() {
    // Reset state
    this.reset();
    // Save initial state
    this.checkpoint();
    // Continue story for the first time
    this.continue();
    // Notify modules about restart
    for (const k of this._moduleNames) {
      this._modules[k]?.onRestart();
    }
  }

  continue() {
    this._coordinator = null;
    let done = false;
    do {
      done = this.step();
    } while (!done);
  }

  step(traversal: "in" | "out" | "over" | "continue" = "continue"): boolean {
    const initialCallstackDepth = this._story.state.callstackDepth;
    const initialExecutedLocation = this._executingLocation;

    while (true) {
      if (this.module.interpreter.shouldFlush() || !this._story.canContinue) {
        this.checkpoint();
        const instructions = this.module.interpreter.flush();
        if (instructions) {
          this._coordinator = new Coordinator(this, instructions);
          if (!this._coordinator.shouldContinue()) {
            this.notifyAwaitingInteraction();
            // DONE - waiting for user interaction (or auto advance)
            return true;
          }
        }
        return false;
      } else if (this._story.canContinue) {
        this._story.ContinueAsync(Infinity);

        if (this._story.asyncContinueComplete) {
          const currentText = this._story.currentText || "";
          const currentChoices = this._story.currentChoices.map((c) => c.text);
          this.module.interpreter.queue(currentText, currentChoices);
          this.notifyStepped();
          return false;
        }

        const pointerPath =
          this._story.state.callStack.currentElement?.previousPointer.path?.toString();
        if (pointerPath) {
          const location = this._program.pathToLocation[pointerPath];
          if (location) {
            const prevExecutedLocation = this._executingLocation;
            this._executingLocation = location;

            // Skip duplicate stops (avoid breaking at the same location)
            if (
              JSON.stringify(prevExecutedLocation) ===
                JSON.stringify(this._executingLocation) ||
              JSON.stringify(initialExecutedLocation) ===
                JSON.stringify(this._executingLocation)
            ) {
              continue;
            }

            const currentCallstackDepth = this._story.state.callstackDepth;

            // Handle step in: Stop at each instruction that is executed
            if (traversal === "in") {
              this.notifyStepped();
              // DONE - stepped in
              return true;
            }

            // Handle step out: Stop when we return to a shallower depth
            if (
              traversal === "out" &&
              currentCallstackDepth < initialCallstackDepth
            ) {
              this.notifyStepped();
              // DONE - stepped out
              return true;
            }

            // Handle step over: Stop at the next line in the same function
            if (
              traversal === "over" &&
              currentCallstackDepth === initialCallstackDepth
            ) {
              this.notifyStepped();
              // DONE - stepped over
              return true;
            }

            // Script index or line is different than last breakpoint
            const [currScriptIndex, currLine] = this._executingLocation;
            const [breakpointScriptIndex, breakpointLine] =
              this._lastHitBreakpointLocation || [];
            if (
              currScriptIndex !== breakpointScriptIndex ||
              currLine !== breakpointLine
            ) {
              // Stop at a breakpoint
              if (
                this._breakpointMap[currScriptIndex]?.has(currLine) ||
                this._functionBreakpointMap[currScriptIndex]?.has(currLine)
              ) {
                this._lastHitBreakpointLocation = this._executingLocation;
                this.notifyHitBreakpoint();
                // DONE - hit breakpoint
                return true;
              }
            }
          }
        }
      } else {
        this.notifyFinished();
        // DONE - ran out of flow
        return true;
      }
    }
  }

  autoAdvancedToContinue() {
    this.continue();
    this.notifyAutoAdvancedToContinue();
  }

  clickedToContinue() {
    this.continue();
    this.notifyClickedToContinue();
  }

  chosePathToContinue(index: number) {
    // Tell the story where to go next
    this._story.ChooseChoiceIndex(index);
    // Save after every choice
    this.checkpoint();
    this.continue();
    this.notifyChosePathToContinue();
  }

  protected notifyHitBreakpoint() {
    this.connection.emit(
      HitBreakpointMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyAwaitingInteraction() {
    this.connection.emit(
      AwaitingInteractionMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyAutoAdvancedToContinue() {
    this.connection.emit(
      AutoAdvancedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyClickedToContinue() {
    this.connection.emit(
      ClickedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyChosePathToContinue() {
    this.connection.emit(
      ChosePathToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyFinished() {
    this.connection.emit(FinishedMessage.type.notification({}));
  }

  protected notifyStartedThread(threadIndex: number) {
    this.connection.emit(
      StartedThreadMessage.type.notification({ threadId: threadIndex })
    );
  }

  protected notifyExitedThread(threadIndex: number) {
    this.connection.emit(
      ExitedThreadMessage.type.notification({ threadId: threadIndex })
    );
  }

  protected notifyContinued() {
    this.connection.emit(
      ContinuedMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyStepped() {
    this.connection.emit(
      SteppedMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  getThreads(): Thread[] {
    const threads: Thread[] = [];
    const callStack = this._story.state.callStack;
    for (const thread of callStack._threads) {
      const threadId = thread.threadIndex;
      threads.push({
        id: threadId,
        name: thread.previousPointer.path?.toString() || "<unknown thread>",
      });
    }
    return threads;
  }

  getStackTrace(
    threadId: number,
    startFrame: number = 0,
    levels?: number
  ): { stackFrames: StackFrame[]; totalFrames: number } {
    const stackFrames: StackFrame[] = [];
    const callStack = this._story.state.callStack;
    const threadIndex = threadId;
    const thread = callStack.ThreadWithIndex(threadIndex);
    if (thread) {
      const frameCount =
        levels != null ? startFrame + levels : thread.callstack.length;
      for (let i = startFrame; i < frameCount; i++) {
        const f = thread.callstack[i]!;
        if (f) {
          const pointerPath =
            f.previousPointer.path?.toString() ??
            f.previousPointer.container?.path?.toString();
          if (pointerPath) {
            const location = this._program.pathToLocation[pointerPath];
            const documentLocation = this.getDocumentLocation(location);
            if (f.type == PushPopType.Function) {
              stackFrames.unshift({
                id: i,
                name: pointerPath || "<unknown function>",
                moduleId: "function",
                presentationHint: "normal",
                location: documentLocation,
              });
            } else {
              stackFrames.unshift({
                id: i,
                name: pointerPath || "<unknown tunnel>",
                moduleId: "tunnel",
                presentationHint: "normal",
                location: documentLocation,
              });
            }
          }
        }
      }
      return { stackFrames, totalFrames: thread.callstack.length };
    }
    return { stackFrames, totalFrames: 0 };
  }

  protected Error(message: string, type: ErrorType) {
    this.connection.emit(
      RuntimeErrorMessage.type.notification({
        message,
        type,
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected TimeoutError() {
    this.Error("Execution timed out: Possible infinite loop", ErrorType.Error);
  }

  loadSave(saveData: string) {
    try {
      if (saveData) {
        this._story.state.LoadJson(saveData);
        return true;
      }
    } catch (e) {
      this.log(e, "error");
    }
    return false;
  }

  log(message: unknown, severity: "info" | "warning" | "error" = "info") {
    this._context.system.log?.(message, severity);
  }

  startDebugging() {
    this._context.system.debugging = true;
  }

  stopDebugging() {
    this._context.system.debugging = true;
  }

  preview(file: string, line: number): void {
    if (this._state === "previewing") {
      // Don't preview while running
      return;
    }
    const path = this.getClosestPath(file, line);
    if (path != null && this._context.system.previewing !== path) {
      this._context.system.previewing = path;
      if (path) {
        if (!this._story.asyncContinueComplete) {
          this.TimeoutError();
        } else {
          this._story.ResetState();
          this._story.ChoosePathString(path);
          this.continue();
          for (const k of this._moduleNames) {
            this._modules[k]?.onPreview();
          }
          this._coordinator = null;
        }
      }
    }
  }

  protected getDocumentLocation(
    location: ScriptLocation | undefined
  ): DocumentLocation {
    const [scriptIndex, startLine, startColumn, endLine, endColumn] =
      location || [];
    const uri =
      scriptIndex != null
        ? this._scripts[scriptIndex] ?? this._program.uri
        : this._program.uri;
    return {
      uri,
      range: {
        start: {
          line: startLine ?? 0,
          character: startColumn ?? 0,
        },
        end: {
          line: endLine ?? 0,
          character: endColumn ?? 0,
        },
      },
    };
  }

  static getActualBreakpoints(
    instructionLocations: ScriptLocation[],
    breakpoints: { file: string; line: number }[],
    scripts: string[]
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const closestInstruction = this.findClosestInstruction(
        instructionLocations,
        breakpoint,
        scripts
      );
      if (closestInstruction) {
        const [_, closestStartLine] = closestInstruction;
        const validBreakpoint = {
          verified: true,
          location: {
            uri: breakpoint.file,
            range: {
              start: {
                line: closestStartLine,
                character: 0,
              },
              end: {
                line: closestStartLine,
                character: 0,
              },
            },
          },
        };
        actualBreakpoints.push(validBreakpoint);
      } else {
        const invalidBreakpoint: Breakpoint = {
          verified: false,
          reason: "failed",
          message: "No instruction found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  static getActualFunctionBreakpoints(
    functionLocations: Record<string, ScriptLocation>,
    breakpoints: { name: string }[],
    scripts: string[]
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const name = breakpoint.name;
      const functionLocation = functionLocations[name];
      if (functionLocation) {
        const [scriptIndex, line] = functionLocation;
        const validBreakpoint = {
          verified: true,
          location: {
            uri: scripts[scriptIndex]!,
            range: {
              start: {
                line: line,
                character: 0,
              },
              end: {
                line: line,
                character: 0,
              },
            },
          },
        };
        actualBreakpoints.push(validBreakpoint);
      } else {
        const invalidBreakpoint: Breakpoint = {
          verified: false,
          reason: "failed",
          message: "No instruction found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  static findClosestInstruction(
    instructionLocations: ScriptLocation[],
    breakpoint: { file: string; line: number },
    scripts: string[]
  ): [number, number, number, number, number] | null {
    const breakpointScriptIndex = scripts.indexOf(breakpoint.file);
    const breakpointStartLine = breakpoint.line;
    // Step 1: Filter only relevant instructions with the same scriptIndex
    const relevantLocations = instructionLocations
      .filter(([scriptIndex]) => scriptIndex === breakpointScriptIndex)
      .sort((a, b) => a[1] - b[1] || a[2] - b[2]); // Sort by startLine, then startColumn

    if (relevantLocations.length === 0) {
      return null; // No valid instructions for this script
    }

    // Step 2: Find the closest NEXT instruction using binary search
    let left = 0,
      right = relevantLocations.length - 1;
    let closestIndex = -1;

    while (left <= right) {
      const mid = Math.floor((left + right) / 2);
      const midLocation = relevantLocations[mid]!;

      if (midLocation[1] >= breakpointStartLine) {
        closestIndex = mid; // Store as potential next instruction
        right = mid - 1; // Look for an even closer one
      } else {
        left = mid + 1;
      }
    }

    // Step 3: Return the next closest instruction if found, otherwise return the first available
    return closestIndex !== -1
      ? relevantLocations[closestIndex]!
      : relevantLocations[0]!;
  }
}
