import { Story } from "@impower/sparkdown/src/inkjs/engine/Story";
import type { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import type { SparkdownRuntimeFormat } from "@impower/sparkdown/src/types/SparkdownRuntimeFormat";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { DocumentSource } from "../types/DocumentSource";
import { ErrorType } from "../types/ErrorType";
import { GameContext } from "../types/GameContext";
import { InstanceMap } from "../types/InstanceMap";
import { Instructions } from "../types/Instructions";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { evaluate } from "../utils/evaluate";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { Module } from "./Module";
import { DidExecuteMessage } from "./messages/DidExecuteMessage";
import { RuntimeErrorMessage } from "./messages/RuntimeErrorMessage";
import { WillExecuteMessage } from "./messages/WillExecuteMessage";

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export type M = { [name: string]: Module };

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

  protected _coordinator: Coordinator<typeof this> | null = null;

  protected _files: string[];

  protected _program: SparkProgram;

  protected _compiled: SparkdownRuntimeFormat;

  protected _executionTimeout = 1000;

  protected _lastExecutedSource: DocumentSource;

  get program() {
    return this._program;
  }

  constructor(
    program: SparkProgram,
    options?: {
      executionTimeout?: number;
      preview?: { file: string; line: number };
      simulation?: {
        waypoints?: { file?: string; line: number }[];
        startpoint?: { file?: string; line: number };
      };
      modules?: {
        [name in keyof T]: abstract new (...args: any) => T[name];
      };
    }
  ) {
    this._program = program;
    if (!program.compiled) {
      throw new Error(
        "Program must be successfully compiled before it can be run"
      );
    }
    this._compiled = program.compiled;
    this._files = Object.keys(program.scripts);
    const modules = options?.modules;
    const previewing = options?.preview
      ? this.getClosestPath(options.preview.file, options?.preview.line)
      : undefined;
    const startpoint = options?.simulation?.startpoint ?? {
      file: this._files[0],
      line: 0,
    };
    if (options?.executionTimeout) {
      this._executionTimeout = options.executionTimeout;
    }

    // Create story to control flow and state
    this._story = new Story(this._compiled);
    this._story.onError = (message: string, type: ErrorType) => {
      this.Error(message, type);
    };
    // Start story from startpoint
    this._lastExecutedSource = startpoint;
    const startPath = this.getClosestPath(startpoint.file, startpoint.line);
    if (startPath) {
      this._story.ChoosePathString(startPath);
    }
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
      ...(program.context || {}),
    };
    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });
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
  }

  getSource(uuid: string) {
    const source = this._compiled.uuidToSource?.[uuid];
    if (source) {
      const [fileIndex, lineIndex] = source;
      const file = this._files[fileIndex];
      const line = lineIndex;
      return { file, line };
    }
    return null;
  }

  getClosestPath(file: string | undefined, line: number | undefined) {
    if (file == null) {
      return "0";
    }
    const fileIndex = this._files.indexOf(file);
    if (fileIndex < 0) {
      return "0";
    }
    if (!this._compiled.uuidToSource) {
      return "0";
    }
    if (line == null) {
      return "0";
    }
    const uuidToSourceEntries = Object.entries(this._compiled.uuidToSource);
    let closestIndex = uuidToSourceEntries.length - 1;
    for (let i = 0; i < uuidToSourceEntries.length; i++) {
      const [, source] = uuidToSourceEntries[i]!;
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
    const match = uuidToSourceEntries[closestIndex];
    if (match == null) {
      return "0";
    }
    const [uuid] = match;
    const path = this._compiled.uuidToPath?.[uuid];
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

  start(save: string = ""): void {
    this._context.system.previewing = undefined;
    if (save) {
      this.loadSave(save);
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
    if (this.module.interpreter.shouldFlush() || !this._story.canContinue) {
      this.checkpoint();
      const instructions = this.module.interpreter.flush();
      if (instructions) {
        if (!this._context.system.previewing) {
          this.notifyWillExecute(instructions);
        }
        this._coordinator = new Coordinator(this, instructions);
        if (!this._context.system.previewing) {
          this.notifyDidExecute(instructions);
        }
      }
    } else if (this._story.canContinue) {
      this._story.ContinueAsync(this._executionTimeout);
      if (!this._story.asyncContinueComplete) {
        this.TimeoutError();
      } else {
        const currentText = this._story.currentText || "";
        const currentChoices = this._story.currentChoices.map((c) => c.text);
        this.module.interpreter.queue(currentText, currentChoices);
        this.continue();
      }
    }
  }

  protected notifyWillExecute(instructions: Instructions) {
    if (instructions.uuids) {
      for (const s of instructions.uuids) {
        const source = this.getSource(s);
        if (source) {
          this._lastExecutedSource = source;
          this.connection.emit(
            WillExecuteMessage.type.notification({ source })
          );
        }
      }
    }
  }

  protected notifyDidExecute(instructions: Instructions) {
    if (instructions.uuids) {
      for (const s of instructions.uuids) {
        const source = this.getSource(s);
        if (source) {
          this._lastExecutedSource = source;
          this.connection.emit(DidExecuteMessage.type.notification({ source }));
        }
      }
    }
  }

  protected Error(message: string, type: ErrorType) {
    this.connection.emit(
      RuntimeErrorMessage.type.notification({
        message,
        type,
        source: this._lastExecutedSource,
      })
    );
  }

  protected TimeoutError() {
    this.Error("Execution timed out: Possible infinite loop", ErrorType.Error);
  }

  choose(index: number) {
    // Tell the story where to go next
    this._story.ChooseChoiceIndex(index);
    // Save after every choice
    this.checkpoint();
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
    this._lastExecutedSource = { file, line };
    const path = this.getClosestPath(file, line);
    if (path != null) {
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
}
