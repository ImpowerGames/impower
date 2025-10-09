import { InkObject } from "@impower/sparkdown/src/inkjs/engine/Object";
import { PushPopType } from "@impower/sparkdown/src/inkjs/engine/PushPop";
import { InkList, Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import {
  buildRouteSimulator,
  planRoute,
} from "@impower/sparkdown/src/utils/planRoute";
import { uuid } from "@impower/sparkdown/src/utils/uuid";
import { ErrorType } from "../../../protocol/enums/ErrorType";
import { Message } from "../../../protocol/types/Message";
import { NotificationMessage } from "../../../protocol/types/NotificationMessage";
import { RequestMessage } from "../../../protocol/types/RequestMessage";
import { ResponseError } from "../../../protocol/types/ResponseError";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { Breakpoint } from "../types/Breakpoint";
import { DocumentLocation } from "../types/DocumentLocation";
import { GameConfiguration } from "../types/GameConfiguration";
import { GameContext } from "../types/GameContext";
import { GameState } from "../types/GameState";
import { InstanceMap } from "../types/InstanceMap";
import { SaveData } from "../types/SaveData";
import { ScriptLocation } from "../types/ScriptLocation";
import { StackFrame } from "../types/StackFrame";
import { SystemConfiguration } from "../types/SystemConfiguration";
import { Thread } from "../types/Thread";
import { Variable, VariablePresentationHint } from "../types/Variable";
import { findClosestPath } from "../utils/findClosestPath";
import { findClosestPathLocation } from "../utils/findClosestPathLocation";
import { Clock } from "./Clock";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { GameAutoAdvancedToContinueMessage } from "./messages/GameAutoAdvancedToContinueMessage";
import { GameAwaitingInteractionMessage } from "./messages/GameAwaitingInteractionMessage";
import { GameChosePathToContinueMessage } from "./messages/GameChosePathToContinueMessage";
import { GameClickedToContinueMessage } from "./messages/GameClickedToContinueMessage";
import { GameEncounteredRuntimeErrorMessage } from "./messages/GameEncounteredRuntimeError";
import { GameExecutedMessage } from "./messages/GameExecutedMessage";
import { GameExitedThreadMessage } from "./messages/GameExitedThreadMessage";
import { GameFinishedMessage } from "./messages/GameFinishedMessage";
import { GameHitBreakpointMessage } from "./messages/GameHitBreakpointMessage";
import { GamePreviewedMessage } from "./messages/GamePreviewedMessage";
import { GameStartedMessage } from "./messages/GameStartedMessage";
import { GameStartedThreadMessage } from "./messages/GameStartedThreadMessage";
import { GameSteppedMessage } from "./messages/GameSteppedMessage";
import { Module } from "./Module";

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export type M = { [name: string]: Module };

export interface RuntimeState {
  pathsExecutedThisFrame: Set<string>;
  choicesEncountered: {
    options: string[];
    selected: number;
  }[];
}

export class Game<T extends M = {}> {
  protected _clock?: Clock;
  get clock() {
    return this._clock;
  }

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
  get scripts() {
    return this._scripts;
  }

  protected _pathLocationEntries: [string, ScriptLocation][];

  protected _coordinator: Coordinator<typeof this> | null = null;

  protected _executionStartTime = 0;

  protected _routeSearchTimeout = 1000;

  protected _executionTimeout = 1000;

  protected _executionTimedOut = false;

  protected _executingPath: string;

  protected _executingLocation: ScriptLocation;

  protected _runtimeState: RuntimeState = {
    pathsExecutedThisFrame: new Set(),
    choicesEncountered: [],
  };
  get runtimeState() {
    return this._runtimeState;
  }

  protected _runtimeSnapshot: RuntimeState | null = null;

  protected _lastHitBreakpointLocation?: ScriptLocation;

  protected _nextObjectVariableRef = 2000; // Start at 2000 to avoid conflicts with scope handles

  protected _objectVariableRefMap = new Map<number, object>();

  protected _simulateChoices?: Record<string, (number | undefined)[]> | null;
  get simulateChoices() {
    return this._simulateChoices;
  }

  protected _startFrom?: {
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

  protected _startPath?: string | null;
  get startPath() {
    return this._startPath;
  }

  protected _breakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _functionBreakpointMap: Record<number, Map<number, Breakpoint>> =
    {};

  protected _dataBreakpointMap: Record<number, Map<number, Breakpoint>> = {};

  protected _checkpoint?: string;

  protected _error = false;

  protected _simulation?: "none" | "simulating" | "success" | "fail";
  get simulation() {
    return this._simulation;
  }

  protected _restarted = false;
  get restarted() {
    return this._restarted;
  }

  protected _state: GameState = "initial";
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

  protected _paused = false;
  get paused() {
    return this._paused;
  }

  constructor(
    program: SparkProgram,
    options?: GameConfiguration &
      SystemConfiguration & {
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

    this._pathLocationEntries = Object.entries(
      this._program.pathLocations || {}
    );

    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });

    this._scripts = Object.keys(this._program.scripts);
    this._restarted = options?.restarted ?? false;
    const modules = options?.modules;
    const previewing = options?.previewFrom ? true : undefined;
    this._state = previewing ? "previewing" : "initial";
    this._simulation = options?.simulateState ? "simulating" : "none";
    this.setSimulateChoices(options?.simulateChoices ?? null);
    const startFrom = options?.previewFrom ??
      options?.startFrom ?? {
        file: this._scripts[0] || this._program.uri,
        line: 0,
      };
    this.setStartFrom(startFrom);

    this._executingPath = "";
    this._executingLocation = [-1, -1, -1, -1, -1];

    this.updateBreakpointsMap(options?.breakpoints ?? []);
    this.updateFunctionBreakpointsMap(options?.functionBreakpoints ?? []);
    this.updateDataBreakpointsMap(options?.dataBreakpoints ?? []);

    if (options?.executionTimeout) {
      this._executionTimeout = options.executionTimeout;
    }

    if (options?.routeSearchTimeout) {
      this._routeSearchTimeout = options.routeSearchTimeout;
    }

    // Create story to control flow and state
    this._story = new Story(this._program.compiled);
    this._story.collapseWhitespace = false;
    this._story.processEscapes = false;

    // Create context
    this._context = {
      system: {
        previewing,
        transitions: true,
        checkpoint: () => this.checkpoint(),
        uuid: () => uuid(),
        supports: (module: string) => this.supports(module),
        now:
          options?.now ??
          (() => {
            return 0;
          }),
        setTimeout:
          options?.setTimeout ??
          (() => {
            throw new Error("setTimeout not configured");
          }),
        log: options?.log,
        fetch: options?.fetch,
        resolve: options?.resolve,
        requestFrame: options?.requestFrame,
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

    for (const moduleName of this._moduleNames) {
      this._modules[moduleName]?.onInit();
    }

    if (this._simulation === "simulating") {
      // Plan route and setup story simulator to follow route
      this.planRoute();
    }

    this._story.onError = (message: string, type: ErrorType) => {
      this.Error(message, type);
    };
    this._story.onExecute = (path: string | undefined) => {
      if (path) {
        // Delete before adding so that last item in set is always the most recently executed
        this._runtimeState.pathsExecutedThisFrame.delete(path);
        this._runtimeState.pathsExecutedThisFrame.add(path);
      }
    };
    this._story.onMakeChoice = (choice) => {
      this._runtimeState?.choicesEncountered.push({
        options: this._story.currentChoices.map((c) => c.text),
        selected: this._story.currentChoices.indexOf(choice),
      });
    };
    this._story.onSaveStateSnapshot = () => {
      this._runtimeSnapshot = {
        pathsExecutedThisFrame: new Set(
          this._runtimeState.pathsExecutedThisFrame
        ),
        choicesEncountered: JSON.parse(
          JSON.stringify(this._runtimeState.choicesEncountered)
        ),
      };
    };
    this._story.onRestoreStateSnapshot = () => {
      if (this._runtimeSnapshot) {
        this._runtimeState = this._runtimeSnapshot;
      }
    };
    this._story.onDiscardStateSnapshot = () => {
      this._runtimeSnapshot = null;
    };

    if (this._simulation === "simulating") {
      // Simulate module state
      this.simulate();
    }

    const system = this._context.system;

    if (system.requestFrame) {
      this._clock = new Clock(
        {
          get currentTime() {
            return system.now();
          },
        },
        (callback: () => void) => system.requestFrame?.(callback) ?? 0
      );
    }
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async connect(send: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this._connection.connectOutput(send);
    for (const moduleName of this._moduleNames) {
      this._modules[moduleName]?.onConnected();
    }
    if (this._simulation === "success") {
      // Restore module state
      await this.restore();
    }
  }

  isContainerPath(path: string) {
    return Boolean(
      path === "0" ||
        this._program.knotLocations?.[path] ||
        this._program.stitchLocations?.[path] ||
        this._program.functionLocations?.[path] ||
        this._program.sceneLocations?.[path] ||
        this._program.branchLocations?.[path]
    );
  }

  setSimulateChoices(
    simulateChoices: Record<string, (number | undefined)[]> | null
  ) {
    if (!simulateChoices) {
      this._simulateChoices = null;
      return null;
    }
    this._simulateChoices = {};
    for (const [path, choices] of Object.entries(simulateChoices)) {
      if (this._program.pathLocations?.[path] || this.isContainerPath(path)) {
        this._simulateChoices[path] = choices;
      }
    }
    return this._simulateChoices;
  }

  setStartFrom(startFrom: { file: string; line: number }) {
    this._startFrom = startFrom;
    this._startPath =
      findClosestPath(
        this._startFrom,
        this._pathLocationEntries,
        this._scripts
      ) || "0";
    if (this._startPath) {
      const trueLocation = this._program.pathLocations?.[this._startPath];
      if (trueLocation) {
        const [scriptIndex, line] = trueLocation;
        const file = this._scripts[scriptIndex];
        if (file) {
          this._startFrom = { file, line };
          return this._startFrom;
        }
      }
    }
    return null;
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

  protected updateBreakpointsMap(
    breakpoints: { file: string; line: number }[]
  ) {
    const actualBreakpoints = Game.getActualBreakpoints(
      this._pathLocationEntries,
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

  protected updateFunctionBreakpointsMap(
    functionBreakpoints: { name: string }[]
  ) {
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

  protected updateDataBreakpointsMap(dataBreakpoints: { dataId: string }[]) {
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

  protected planRoute(): void {
    const toPath = this._startPath;
    if (toPath) {
      // Plan a route from the top of the knot containing the target path, to the target path itself
      const containerName = toPath.split(".")[0] || "0";
      const fromPath = containerName;
      const route = planRoute(this._story, fromPath, toPath, {
        functions: Object.keys(this._program.functionLocations || {}),
        searchTimeout: this._routeSearchTimeout,
        stayWithinKnot: true,
        favoredChoiceIndices: this._simulateChoices?.[fromPath],
      });
      if (route) {
        // If route exists, force the story to follow this route
        this._story.simulator = buildRouteSimulator(route.steps);
        this._simulatePath = fromPath;
      }
    }
  }

  protected simulate(): void {
    if (this._simulatePath) {
      this._context.system.simulating = this._simulatePath;
      this.jumpToPath(this._simulatePath);
      this.continue(true);
      const autoTurns = this._simulateChoices?.[this._simulatePath];
      while (
        this._simulation === "simulating" &&
        !this._story.canContinue &&
        this._story.currentChoices.length > 0
      ) {
        const turnIndex = this._runtimeState.choicesEncountered.length;
        const autoTurn = autoTurns?.[turnIndex];
        const autoSelected =
          autoTurn != null &&
          autoTurn >= 0 &&
          autoTurn < this._story.currentChoices.length
            ? autoTurn!
            : 0;
        this._story.ChooseChoiceIndex(autoSelected);
        this.continue(true);
      }
    }
    this._story.simulator = null;
  }

  start(save: string = ""): boolean {
    this._state = "running";
    if (this._simulation === "simulating") {
      this._simulation = "fail";
    }
    this.notifyStarted();
    this._context.system.previewing = undefined;
    this._context.system.simulating = undefined;
    for (const k of this._moduleNames) {
      this._modules[k]?.onStart();
    }
    if (this._simulation === "success") {
      this.continue(true);
    } else {
      if (save) {
        this.load(save);
      } else if (this._startPath) {
        this.jumpToPath(this._startPath);
      }
      this.continue();
    }
    if (this._clock) {
      this._clock.add((time) => this.update(time));
      this._clock.start();
    }
    return !this._error;
  }

  pause(): void {
    this._paused = true;
    if (this._clock) {
      this._clock.speed = 0;
    }
  }

  unpause(): void {
    this._paused = false;
    if (this._clock) {
      this._clock.speed = 1;
    }
  }

  skip(seconds: number): void {
    if (this._clock) {
      this._clock.adjustTime(seconds);
      this.update(this._clock);
    }
  }

  update(time: Clock) {
    if (!this._destroyed && !this.paused) {
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
    let story = "";
    try {
      story = this._story.state.toJson();
    } catch (e: any) {
      this.Error(e.message, ErrorType.Error);
    }
    const saveData: SaveData = {
      modules: {},
      context: {},
      story,
      executed: Array.from(this._runtimeState?.pathsExecutedThisFrame ?? []),
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
      if (saveData.executed) {
        for (const path of saveData.executed) {
          this._runtimeState?.pathsExecutedThisFrame.add(path);
        }
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
    if (this._story.canContinue && !this._story.asyncContinueComplete) {
      this._story.Continue();
    }
    // Reset story to its initial state
    this._story.ResetState();
    // Reset modules to their initial state
    for (const k of this._moduleNames) {
      const module = this._modules[k];
      if (module) {
        module.reset();
      }
    }
  }

  continue(preserveExecutionInfo?: boolean) {
    if (!preserveExecutionInfo) {
      this._runtimeState = {
        pathsExecutedThisFrame: new Set(),
        choicesEncountered: [],
      };
    }

    this._executionTimedOut = false;
    this._executionStartTime = this.context.system.now();

    this.clearVariableReferences();
    this._coordinator = null;
    let done = false;
    do {
      done = this.step();
    } while (!this._error && !done);

    if (this._simulation !== "simulating") {
      this.notifyExecuted();
    }

    return done;
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
        if (this._simulation !== "simulating") {
          this.checkpoint();
        }
        const instructions = this.module.interpreter.flush();
        if (instructions) {
          this._coordinator = new Coordinator(this, instructions);
          if (
            !this._coordinator.shouldContinue() &&
            this._simulation !== "simulating"
          ) {
            this.notifyAwaitingInteraction();
          }
        }
        if (this._simulation === "simulating") {
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
            const location = this._program.pathLocations?.[pointerPath];
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
            this._simulation === "simulating" &&
            this._startPath &&
            this._runtimeState.pathsExecutedThisFrame.has(this._startPath)
          ) {
            // End simulation
            this._simulation = "success";
            return true;
          }
        }

        if (this._simulation !== "simulating") {
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

  jumpToPath(path: string) {
    if (this._story.canContinue && !this._story.asyncContinueComplete) {
      this._story.Continue();
    }
    this._story.ResetState();
    this._story.ChoosePathString(path);
  }

  protected notifyHitBreakpoint() {
    this.connection.emit(
      GameHitBreakpointMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyAwaitingInteraction() {
    this.connection.emit(
      GameAwaitingInteractionMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyAutoAdvancedToContinue() {
    this.connection.emit(
      GameAutoAdvancedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyClickedToContinue() {
    this.connection.emit(
      GameClickedToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyChosePathToContinue() {
    this.connection.emit(
      GameChosePathToContinueMessage.type.notification({
        location: this.getDocumentLocation(this._executingLocation),
      })
    );
  }

  protected notifyStarted() {
    this.connection.emit(GameStartedMessage.type.notification({}));
  }

  protected notifyFinished() {
    this.connection.emit(GameFinishedMessage.type.notification({}));
  }

  protected notifyStartedThread(threadIndex: number) {
    this.connection.emit(
      GameStartedThreadMessage.type.notification({ threadId: threadIndex })
    );
  }

  protected notifyExitedThread(threadIndex: number) {
    this.connection.emit(
      GameExitedThreadMessage.type.notification({ threadId: threadIndex })
    );
  }

  protected notifyPreviewed(path: string) {
    const location = this.getDocumentLocation(
      this._program.pathLocations?.[path]
    );
    this.connection.emit(
      GamePreviewedMessage.type.notification({
        location,
        path,
      })
    );
  }

  protected notifyExecuted() {
    const locations: DocumentLocation[] = [];
    this._runtimeState.pathsExecutedThisFrame.forEach((p) => {
      const l = this._program.pathLocations?.[p];
      if (l) {
        locations.push(this.getDocumentLocation(l));
      }
    });
    this.connection.emit(
      GameExecutedMessage.type.notification({
        simulatePath: this._simulatePath,
        startPath: this._startPath,
        executedPaths: Array.from(this._runtimeState.pathsExecutedThisFrame),
        locations,
        choices: this._runtimeState.choicesEncountered,
        state: this._state,
        restarted: this._restarted,
        simulation: this._simulation,
      })
    );
  }

  protected notifyStepped() {
    this.connection.emit(
      GameSteppedMessage.type.notification({
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
              this._program.pathLocations?.[pointerPath] ??
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
      GameEncounteredRuntimeErrorMessage.type.notification({
        message,
        type,
        location: this.getDocumentLocation(this._executingLocation),
        state: this._state,
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

  preview(file: string, line: number): string | null {
    if (this._state === "running") {
      // Don't preview while running
      return null;
    }
    const previewPath = findClosestPath(
      { file, line },
      this._pathLocationEntries,
      this._scripts
    );
    if (!previewPath) {
      return null;
    }
    if (this._context.system.previewing === previewPath) {
      return previewPath;
    }
    this._previewFrom = { file, line };
    this._executingPath = "";
    this._executingLocation = [-1, -1, -1, -1, -1];
    if (this._simulation === "simulating") {
      this._simulation = "fail";
    }
    this._context.system.previewing = previewPath;
    this._context.system.simulating = undefined;
    if (this._simulation === "success") {
      this.continue(true);
    } else if (this._simulation === "fail") {
      this.reset();
      this.clearChoices();
      this._startPath = previewPath;
      this.jumpToPath(previewPath);
      this.continue();
    } else {
      this.clearChoices();
      this._startPath = previewPath;
      this.jumpToPath(previewPath);
      this.continue();
    }
    for (const k of this._moduleNames) {
      this._modules[k]?.onPreview();
    }
    this._coordinator = null;
    if (previewPath) {
      this.notifyPreviewed(previewPath);
    }
    return previewPath;
  }

  getPathDocumentLocation(path: string) {
    const location = this._program.pathLocations?.[path];
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
        findClosestPathLocation(breakpoint, pathLocationEntries, scripts) || [];
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
          message: "No variable found at the breakpoint",
        };
        actualBreakpoints.push(invalidBreakpoint);
      }
    }
    return actualBreakpoints;
  }

  getClosestPath(file: string, line: number) {
    return findClosestPath(
      { file, line },
      this._pathLocationEntries,
      this._scripts
    );
  }
}
