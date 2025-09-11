import { InkObject } from "@impower/sparkdown/src/inkjs/engine/Object";
import { PushPopType } from "@impower/sparkdown/src/inkjs/engine/PushPop";
import { InkList, Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { uuid } from "@impower/sparkdown/src/utils/uuid";
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
import { Variable, VariablePresentationHint } from "../types/Variable";
import { Clock } from "./Clock";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { AutoAdvancedToContinueMessage } from "./messages/AutoAdvancedToContinueMessage";
import { AwaitingInteractionMessage } from "./messages/AwaitingInteractionMessage";
import { ChosePathToContinueMessage } from "./messages/ChoosePathToContinueMessage";
import { ClickedToContinueMessage } from "./messages/ClickedToContinueMessage";
import { ExecutedMessage } from "./messages/ExecutedMessage";
import { ExitedThreadMessage } from "./messages/ExitedThreadMessage";
import { FinishedMessage } from "./messages/FinishedMessage";
import { HitBreakpointMessage } from "./messages/HitBreakpointMessage";
import { PreviewedMessage } from "./messages/PreviewedMessage";
import { RuntimeErrorMessage } from "./messages/RuntimeErrorMessage";
import { StartedMessage } from "./messages/StartedMessage";
import { StartedThreadMessage } from "./messages/StartedThreadMessage";
import { SteppedMessage } from "./messages/SteppedMessage";
import { Module } from "./Module";

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

export interface SaveData {
  modules: Record<string, any>;
  context: any;
  story: string;
}

export class Game<T extends M = {}> {
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

  protected _pathLocations: [string, ScriptLocation][];

  protected _coordinator: Coordinator<typeof this> | null = null;

  protected _executionStartTime = 0;

  protected _executionTimeout = 1000;

  protected _executionTimedOut = false;

  protected _executingPath: string;

  protected _executingLocation: ScriptLocation;
  protected _executedPathsThisFrame: Set<string> = new Set();

  protected _lastHitBreakpointLocation?: ScriptLocation;

  protected _nextObjectVariableRef = 2000; // Start at 2000 to avoid conflicts with scope handles

  protected _objectVariableRefMap = new Map<number, object>();

  protected _simulateFrom?: {
    file: string;
    line: number;
  };
  get simulateFrom() {
    return this._simulateFrom;
  }

  protected _startFrom: {
    file: string;
    line: number;
  };
  get startFrom() {
    return this._startFrom;
  }

  protected _previewFrom?: {
    file: string;
    line: number;
  };
  get previewFrom() {
    return this._previewFrom;
  }

  protected _simulatePath?: string | null;
  get simulatePath() {
    return this._simulatePath;
  }

  protected _startPath: string;
  get startPath() {
    return this._startPath;
  }

  protected _breakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _functionBreakpointMap: Record<number, Map<number, Breakpoint>> =
    {};

  protected _dataBreakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _checkpoint?: string;

  protected _error = false;

  protected _restarted = false;
  get restarted() {
    return this._restarted;
  }

  protected _state: "initial" | "previewing" | "running" = "initial";
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

  protected _destroyed = false;
  get destroyed() {
    return this._destroyed;
  }

  constructor(
    program: SparkProgram,
    options?: {
      restarted?: boolean;
      executionTimeout?: number;
      simulateFrom?: { file: string; line: number };
      previewFrom?: { file: string; line: number };
      startFrom?: { file: string; line: number };
      breakpoints?: { file: string; line: number }[];
      functionBreakpoints?: { name: string }[];
      dataBreakpoints?: { dataId: string }[];
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

    this._pathLocations = Object.entries(this._program.pathToLocation || {});

    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });

    this._scripts = Object.keys(this._program.scripts);
    this._restarted = options?.restarted ?? false;
    const modules = options?.modules;
    const previewing = options?.previewFrom ? true : undefined;
    this._state = previewing ? "previewing" : "initial";
    this._simulateFrom = options?.simulateFrom;
    if (this._simulateFrom) {
      this._simulatePath = this.getClosestPath(
        this._simulateFrom.file,
        this._simulateFrom.line
      );
    }
    this._startFrom = options?.previewFrom ??
      options?.startFrom ?? {
        file: this._scripts[0] || this._program.uri,
        line: 0,
      };
    this._startPath =
      this.getClosestPath(this._startFrom.file, this._startFrom.line) || "0";

    this.updateBreakpointsMap(options?.breakpoints ?? []);
    this.updateFunctionBreakpointsMap(options?.functionBreakpoints ?? []);
    this.updateDataBreakpointsMap(options?.dataBreakpoints ?? []);

    if (options?.executionTimeout) {
      this._executionTimeout = options.executionTimeout;
    }

    // Create story to control flow and state
    this._story = new Story(this._program.compiled);
    this._story.collapseWhitespace = false;
    this._story.processEscapes = false;
    this._story.onError = (message: string, type: ErrorType) => {
      this.Error(message, type);
    };
    this._story.onExecute = (path: string | undefined) => {
      if (path) {
        // Delete before adding so that last item in set is always the most recently executed
        this._executedPathsThisFrame.delete(path);
        this._executedPathsThisFrame.add(path);
      }
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
        now: () => {
          return 0;
        },
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

    this._executingPath = "";
    this._executingLocation = [-1, -1, -1, -1, -1];
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async init(config: {
    send: (message: Message, transfer?: ArrayBuffer[]) => void;
    now: () => number;
    resolve: (path: string) => string;
    fetch: (url: string) => Promise<string | ArrayBuffer>;
    log: (message: unknown, severity: "info" | "warning" | "error") => void;
    setTimeout: (handler: Function, timeout?: number, ...args: any[]) => number;
  }) {
    this._connection.connectOutput(config.send);
    this._context.system.now = config.now;
    this._context.system.resolve = config.resolve;
    this._context.system.fetch = config.fetch;
    this._context.system.log = config.log;
    this._context.system.setTimeout = config.setTimeout;
    this._context.system.initialized = true;
    for (const moduleName of this._moduleNames) {
      this._modules[moduleName]?.onInit();
    }
    if (this._simulateFrom) {
      this.simulate();
      // Restore module state
      await this.restore();
    }
  }

  setSimulateFrom(simulateFrom: { file: string; line: number } | undefined) {
    this._simulateFrom = simulateFrom;
    if (this._simulateFrom) {
      this._simulatePath = this.getClosestPath(
        this._simulateFrom.file,
        this._simulateFrom.line
      );
    }
  }

  setStartFrom(startFrom: { file: string; line: number }) {
    this._startFrom = startFrom;
    this._startPath =
      this.getClosestPath(this._startFrom.file, this._startFrom.line) || "0";
  }

  setBreakpoints(breakpoints: { file: string; line: number }[]) {
    return this.updateBreakpointsMap(breakpoints);
  }

  setFunctionBreakpoints(functionBreakpoints: { name: string }[]) {
    return this.updateFunctionBreakpointsMap(functionBreakpoints);
  }

  setDataBreakpoints(dataBreakpoints: { dataId: string }[]) {
    return this.updateDataBreakpointsMap(dataBreakpoints);
  }

  updateBreakpointsMap(breakpoints: { file: string; line: number }[]) {
    const actualBreakpoints = Game.getActualBreakpoints(
      this._pathLocations,
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

  updateDataBreakpointsMap(dataBreakpoints: { dataId: string }[]) {
    const actualBreakpoints = Game.getActualDataBreakpoints(
      this._program.dataLocations,
      dataBreakpoints,
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
    this._dataBreakpointMap = breakpointMap;
    return actualBreakpoints;
  }

  simulate(): void {
    if (this._simulatePath) {
      this._context.system.simulating = this._simulatePath;
      this._story.ChoosePathString(this._simulatePath);
      this.continue();
      while (
        !this._story.canContinue &&
        this._story.currentChoices.length > 0
      ) {
        // TODO: Determine which choice will lead to the destination
        const choiceIndex = 0;
        this._story.ChooseChoiceIndex(choiceIndex);
        this.continue();
      }
    }
  }

  start(save: string = ""): boolean {
    this._state = "running";
    this.notifyStarted();
    this._context.system.previewing = undefined;
    this._context.system.simulating = undefined;
    for (const k of this._moduleNames) {
      this._modules[k]?.onStart();
    }
    if (!this._simulateFrom) {
      if (save) {
        this.load(save);
      } else {
        this._story.ChoosePathString(this._startPath);
      }
    }
    this.continue();
    return !this._error;
  }

  update(time: Clock) {
    if (!this._destroyed) {
      for (const k of this._moduleNames) {
        this._modules[k]?.onUpdate(time);
      }
      if (this._coordinator) {
        this._coordinator.onUpdate(time);
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

  checkpoint(): void {
    this._checkpoint = this.save();
  }

  save(): string {
    const saveData: SaveData = {
      modules: {},
      context: {},
      story: this._story.state.toJson(),
    };
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.onSerialize();
        saveData.modules[k] = module.state;
      }
    }
    const serialized = JSON.stringify(saveData);
    return serialized;
  }

  load(saveJSON: string) {
    try {
      const saveData: SaveData = JSON.parse(saveJSON);
      for (const k of this._moduleNames) {
        const module = this._modules[k];
        if (module) {
          module.load(saveData.modules[k]);
        }
      }
      if (saveData.story) {
        this._story.state.LoadJson(saveData.story);
        return true;
      }
    } catch (e) {
      this.log(e, "error");
    }
    return false;
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
    this._executedPathsThisFrame.clear();
    this._executionTimedOut = false;
    this._executionStartTime = this.context.system.now();

    this.clearVariableReferences();
    this._coordinator = null;
    let done = false;
    do {
      done = this.step();
    } while (!this._error && !done);
    this.notifyExecuted();
  }

  step(traversal: "in" | "out" | "over" | "continue" = "continue"): boolean {
    const initialCallstackDepth = this._story.state.callstackDepth;
    const initialExecutedLocation = this._executingLocation;

    while (true) {
      this._executionTimedOut =
        this.context.system.now() >=
        this._executionStartTime + this._executionTimeout;

      if (this._executionTimedOut) {
        this.Error(
          "Execution timed out: Possible infinite loop",
          ErrorType.Error
        );
        // Execution is taking too long. Force it to stop.
        return true;
      }

      if (this.module.interpreter.shouldFlush() || !this._story.canContinue) {
        if (!this.context.system.simulating) {
          this.checkpoint();
        }
        const instructions = this.module.interpreter.flush();
        if (instructions) {
          this._coordinator = new Coordinator(this, instructions);
          if (
            !this._coordinator.shouldContinue() &&
            !this.context.system.simulating
          ) {
            this.notifyAwaitingInteraction();
          }
        }
        if (this.context.system.simulating) {
          if (!this._story.canContinue) {
            return true;
          }
          // Continue without user interaction
          continue;
        }
        // DONE - waiting for user interaction (or auto advance)
        return true;
      } else if (this._story.canContinue) {
        this._story.ContinueAsync(Infinity);

        const prevExecutedLocation = this._executingLocation;
        const pointerPath =
          this._story.state.callStack.currentElement?.previousPointer.path?.toString();
        if (pointerPath) {
          if (pointerPath !== this._executingPath) {
            this._executingPath = pointerPath;
            const location = this._program.pathToLocation?.[pointerPath];
            if (location) {
              this._executingLocation = location;
            }
          }
        }

        if (this._story.asyncContinueComplete) {
          const currentText = this._story.currentText || "";
          const currentChoices = this._story.currentChoices.map((c) => c.text);
          this.module.interpreter.queue(currentText, currentChoices);

          if (
            this.context.system.simulating &&
            this._executedPathsThisFrame.has(this._startPath)
          ) {
            // End simulation
            this._context.system.simulating = false;
            return true;
          }
        }

        if (!this.context.system.simulating) {
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

          // Handle step over: Stop at the next line in the same function
          if (
            traversal === "over" &&
            currentCallstackDepth <= initialCallstackDepth
          ) {
            this.notifyStepped();
            // DONE - stepped over
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
              this._functionBreakpointMap[currScriptIndex]?.has(currLine) ||
              this._dataBreakpointMap[currScriptIndex]?.has(currLine)
            ) {
              this._lastHitBreakpointLocation = this._executingLocation;
              this.notifyHitBreakpoint();
              // DONE - hit breakpoint
              return true;
            }
          }
        }

        if (this._story.asyncContinueComplete) {
          return false;
        }
      } else {
        if (this._state === "running") {
          this.notifyFinished();
        }
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

  clearChoices() {
    // TODO: don't suffix name with number so "choice" can be searched for and cleared all at once
    for (let i = 0; i < 10; i++) {
      const target = `choice_${i}`;
      this.module.ui.text.clear(target);
      this.module.ui.image.clear(target);
      this.module.ui.unobserve("click", target);
      this.module.ui.hide(target);
    }
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

  protected notifyStarted() {
    this.connection.emit(StartedMessage.type.notification({}));
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

  protected notifyPreviewed(path: string) {
    const location = this.getDocumentLocation(
      this._program.pathToLocation?.[path]
    );
    this.connection.emit(
      PreviewedMessage.type.notification({
        location,
        path,
      })
    );
  }

  protected notifyExecuted() {
    const locations: DocumentLocation[] = [];
    this._executedPathsThisFrame.forEach((p) => {
      const l = this._program.pathToLocation?.[p];
      if (l) {
        locations.push(this.getDocumentLocation(l));
      }
    });
    this.connection.emit(
      ExecutedMessage.type.notification({
        locations,
        path: this._executingPath,
        state: this._state,
        restarted: this._restarted,
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

  getEvaluationContext() {
    const context: any = {};
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      const valueObj = variableState.GetVariableWithName(name);
      const value = this.getRuntimeValue(name, valueObj);
      if (value !== undefined) {
        context[name] = value;
      }
    }
    const contextIndex = variableState.callStack.currentElementIndex + 1;
    let contextElement =
      variableState.callStack.currentThread.callstack[contextIndex - 1];
    if (contextElement?.temporaryVariables) {
      for (const [
        name,
        valueObj,
      ] of contextElement?.temporaryVariables.entries()) {
        const value = this.getRuntimeValue(name, valueObj);
        if (value !== undefined) {
          context[name] = value;
        }
      }
    }
    return context;
  }

  getVarVariables(): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    for (const name of variableState["_globalVariables"].keys()) {
      const listDefinition = this._story.listDefinitions?.TryListGetDefinition(
        name,
        null
      )?.result;
      if (!listDefinition) {
        const valueObj = variableState.GetVariableWithName(name);
        const value = this.getRuntimeValue(name, valueObj);
        if (value !== undefined) {
          variables.push(
            this.getVariableInfo(name, value, {
              kind: "data",
              visibility: "public",
            })
          );
        }
      }
    }
    return variables;
  }

  getListVariables(): Variable[] {
    const variables: Variable[] = [];
    if (this._story.listDefinitions) {
      for (const listDefinition of this._story.listDefinitions.lists) {
        const value: Record<string, unknown> = { $type: "list.def" };
        for (const [key, itemValue] of listDefinition.items) {
          const keyObj = JSON.parse(key) as {
            originName: string;
            itemName: string;
          };
          value[keyObj.itemName] = itemValue;
        }
        if (value !== undefined) {
          variables.push(
            this.getVariableInfo(listDefinition.name, value, {
              kind: "data",
              visibility: "public",
            })
          );
        }
      }
    }
    return variables;
  }

  getDefineVariables(): Variable[] {
    const variables: Variable[] = [];
    for (const [type, structs] of Object.entries(this.context)) {
      if (type !== "system") {
        variables.push(
          this.getVariableInfo(type, structs, {
            kind: "interface",
            visibility: "public",
          })
        );
      }
    }
    return variables;
  }

  getTempVariables(): Variable[] {
    const variables: Variable[] = [];
    const variableState = this._story.state.variablesState;
    const contextIndex = variableState.callStack.currentElementIndex + 1;
    let contextElement =
      variableState.callStack.currentThread.callstack[contextIndex - 1];
    if (contextElement?.temporaryVariables) {
      for (const [
        name,
        valueObj,
      ] of contextElement?.temporaryVariables.entries()) {
        if (!name.startsWith("$")) {
          const value = this.getRuntimeValue(name, valueObj);
          const scopePath = this._executingPath
            .split(".")
            .filter(
              (p) =>
                Number.isNaN(Number(p)) && !p.includes("-") && !p.includes("$")
            )
            .join(".");
          if (value !== undefined) {
            variables.push(
              this.getVariableInfo(
                name,
                value,
                {
                  kind: "data",
                  visibility: "private",
                },
                scopePath
              )
            );
          }
        }
      }
    }
    return variables;
  }

  getChildVariables(varRef: number): Variable[] {
    const variables: Variable[] = [];
    const value = this._objectVariableRefMap.get(varRef);
    if (typeof value === "object" && Array.isArray(value)) {
      value.forEach((v, index) => {
        variables.push(
          this.getVariableInfo(index.toString(), v, {
            kind: "property",
            visibility: "public",
          })
        );
      });
    } else if (typeof value === "object" && value) {
      for (const [k, v] of Object.entries(value)) {
        if (!k.startsWith("$")) {
          variables.push(
            this.getVariableInfo(k, v, {
              kind: "property",
              visibility: "public",
            })
          );
        }
      }
    } else {
      variables.push(
        this.getVariableInfo("", value, {
          kind: "property",
          visibility: "public",
        })
      );
    }
    return variables;
  }

  getValueVariables(value: any): Variable[] {
    const variables: Variable[] = [];
    variables.push(
      this.getVariableInfo("", value, {
        kind: "property",
        visibility: "public",
      })
    );
    return variables;
  }

  getRuntimeValue(
    name: string,
    valueObj: InkObject | null
  ): unknown | undefined {
    if (valueObj && "value" in valueObj) {
      if (valueObj.value instanceof InkList) {
        const listDefinition =
          this._story.listDefinitions?.TryListGetDefinition(name, null)?.result;
        if (listDefinition) {
          const listValue: Record<string, unknown> = { $type: "list.def" };
          for (const [key, itemValue] of listDefinition.items) {
            const keyObj = JSON.parse(key) as {
              originName: string;
              itemName: string;
            };
            listValue[keyObj.itemName] = itemValue;
          }
          return listValue;
        }
        const listValue: Record<string, unknown> = { $type: "list.var" };
        for (const [key, value] of valueObj.value.entries()) {
          const keyObj = JSON.parse(key) as {
            originName: string;
            itemName: string;
          };
          listValue[keyObj.originName + "." + keyObj.itemName] = value;
        }
        return listValue;
      }
      return valueObj.value;
    }
    return undefined;
  }

  getVariableInfo(
    name: string,
    value: unknown,
    presentationHint?: VariablePresentationHint,
    scopePath?: string
  ): Variable {
    let variablesReference = 0;
    if (typeof value === "object" && value != null) {
      variablesReference = this._nextObjectVariableRef;
      this._objectVariableRefMap.set(variablesReference, value);
      this._nextObjectVariableRef++;
    }
    const indexedVariables =
      typeof value === "object" && value != null && Array.isArray(value)
        ? value.length
        : 0;
    const namedVariables =
      typeof value === "object" && value != null && !Array.isArray(value)
        ? Object.keys(value).length
        : 0;
    const displayValue =
      value === undefined
        ? "undefined"
        : value === null
        ? "null"
        : typeof value === "object"
        ? Array.isArray(value)
          ? `[${value.length}]`
          : Object.keys(value).filter((k) => !k.startsWith("$")).length > 0
          ? "$type" in value &&
            (value.$type === "list.def" || value.$type === "list.var")
            ? "(...)"
            : "{...}"
          : "$type" in value &&
            (value.$type === "list.def" || value.$type === "list.var")
          ? "()"
          : "{}"
        : JSON.stringify(value);
    const displayType =
      value === undefined
        ? "undefined"
        : value === null
        ? "null"
        : typeof value === "object"
        ? Array.isArray(value)
          ? `array`
          : "$type" in value && typeof value.$type === "string"
          ? value.$type === "list.def" || value.$type === "list.var"
            ? "list"
            : value.$type
          : "object"
        : typeof value;
    return {
      scopePath,
      name,
      value: displayValue,
      type: displayType,
      variablesReference,
      indexedVariables,
      namedVariables,
      presentationHint,
    };
  }

  clearVariableReferences() {
    this._objectVariableRefMap.clear();
    this._nextObjectVariableRef = 2000;
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
            const location =
              this._program.pathToLocation?.[pointerPath] ??
              this._executingLocation;
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
    this._error = true;
    this.connection.emit(
      RuntimeErrorMessage.type.notification({
        message,
        type,
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
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

  preview(file: string, line: number): boolean {
    if (this._state === "running") {
      // Don't preview while running
      return false;
    }

    const previewPath = this.getClosestPath(file, line);
    if (!previewPath || this._context.system.previewing === previewPath) {
      return true;
    }
    this._previewFrom = { file, line };
    this._executingPath = "";
    this._executingLocation = [-1, -1, -1, -1, -1];
    this._context.system.previewing = previewPath;
    if (!this._simulateFrom) {
      this.clearChoices();
      this._startPath = previewPath;
      this._story.ChoosePathString(previewPath);
    }
    this.continue();
    for (const k of this._moduleNames) {
      this._modules[k]?.onPreview();
    }
    this._coordinator = null;
    if (previewPath) {
      this.notifyPreviewed(previewPath);
    }
    return !this._executionTimedOut;
  }

  getPathDocumentLocation(path: string) {
    const location = this._program.pathToLocation?.[path];
    if (location) {
      return this.getDocumentLocation(location);
    }
    return null;
  }

  getLastExecutedDocumentLocation() {
    return this.getDocumentLocation(this._executingLocation);
  }

  getDocumentLocation(location: ScriptLocation | undefined): DocumentLocation {
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
    pathLocationEntries: [string, ScriptLocation][],
    breakpoints: { file: string; line: number }[],
    scripts: string[]
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const [, closestInstruction] =
        this.findClosestPathLocation(
          breakpoint,
          pathLocationEntries,
          scripts
        ) || [];
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
    functionLocations: Record<string, ScriptLocation> | undefined,
    breakpoints: { name: string }[],
    scripts: string[]
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const name = breakpoint.name;
      const functionLocation = functionLocations?.[name];
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

  static getActualDataBreakpoints(
    dataLocations: Record<string, ScriptLocation> | undefined,
    breakpoints: { dataId: string }[],
    scripts: string[]
  ) {
    const actualBreakpoints: Breakpoint[] = [];
    for (const breakpoint of breakpoints) {
      const dataId = breakpoint.dataId;
      const dataLocation = dataLocations?.[dataId];
      if (dataLocation) {
        const [scriptIndex, line] = dataLocation;
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
          message: "No var found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  getClosestPath(file: string | undefined, line: number | undefined) {
    if (file == null || line == null) {
      return null;
    }
    const [path] =
      Game.findClosestPathLocation(
        { file, line },
        this._pathLocations,
        this._scripts
      ) || [];
    const parentPath = path?.split(".").slice(0, -1).join(".");
    if (parentPath?.endsWith(".$s")) {
      // If we are inside choice start content, begin from start of choice
      const grandParentPath = parentPath?.split(".").slice(0, -1).join(".");
      return grandParentPath;
    }
    return path ?? null;
  }

  static findClosestPathLocation(
    breakpoint: { file: string; line: number },
    pathLocationEntries: [string, ScriptLocation][],
    scripts: string[]
  ): [string, ScriptLocation] | null {
    const breakpointScriptIndex = scripts.indexOf(breakpoint.file);
    const breakpointLine = breakpoint.line;

    // Step 1: Filter only relevant instructions with the same scriptIndex
    const relevantLocations = pathLocationEntries.filter(
      ([, location]) => location[0] === breakpointScriptIndex
    );

    // Step 2: Check for an exact match within startLine and endLine
    for (let i = 0; i < relevantLocations.length; i++) {
      const [, location] = relevantLocations[i]!;
      const [, startLine, , endLine] = location;

      if (breakpointLine >= startLine && breakpointLine <= endLine) {
        return relevantLocations[i]!; // Exact match found
      }

      if (startLine > breakpointLine && endLine > breakpointLine) {
        // We've passed the breakpoint line, so return
        return relevantLocations[i]!;
      }
    }

    return null; // No valid instructions for this script
  }
}
