import { Story } from "../../../../../sparkdown/src/inkjs/engine/Story";
import type { SparkProgram } from "../../../../../sparkdown/src/types/SparkProgram";
import { DEFAULT_MODULES } from "../../modules/DEFAULT_MODULES";
import { GameContext } from "../types/GameContext";
import { InstanceMap } from "../types/InstanceMap";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { evaluate } from "../utils/evaluate";
import { getAllProperties } from "../utils/getAllProperties";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Coordinator } from "./Coordinator";
import { Module } from "./Module";
import { DidExecuteMessage } from "./messages/DidExecuteMessage";
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

  protected _latestCheckpointId = "";
  get latestCheckpointId() {
    return this._latestCheckpointId;
  }

  protected _latestCheckpointData = "";
  get latestCheckpointData() {
    return this._latestCheckpointData;
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

  constructor(
    program: SparkProgram,
    options?: {
      previewing?: boolean;
      modules?: {
        [name in keyof T]: abstract new (...args: any) => T[name];
      };
    }
  ) {
    const compiled = program.compiled as Record<string, any>;
    const previewing = options?.previewing;
    const modules = options?.modules;
    this._files = Object.keys(program.sourceMap || {});
    // Create story to control flow and state
    this._story = new Story(compiled);
    // Create context
    this._context = {
      system: {
        previewing,
        initialized: false,
        transitions: true,
        checkpoint: () => this.checkpoint(),
        restore: () => this.restore(),
        uuid: () => uuid(),
        supports: (module: string) => this.supports(module),
      },
    };
    // Create connection for sending and receiving messages
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });
    // Override default modules with custom ones if specified
    const allModules = {
      ...modules, // custom modules should be first in order
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
        const moduleBuiltins = module.getBuiltins();
        if (moduleBuiltins) {
          for (const [k, v] of Object.entries(moduleBuiltins)) {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              this._context[k] ??= {};
              for (const [name, value] of Object.entries(v)) {
                if (this._context[k][name] === undefined) {
                  this._context[k][name] = value;
                }
              }
            } else {
              if (this._context[k] === undefined) {
                this._context[k] = v;
              }
            }
          }
        }
        const moduleStored = module.getStored();
        if (moduleStored) {
          this._stored.push(...moduleStored);
        }
      }
    }
    this._moduleNames = moduleNames;

    if (compiled["structDefs"]) {
      for (const [type, structs] of Object.entries(compiled["structDefs"])) {
        this._context[type] ??= {};
        for (const [name, struct] of Object.entries(structs as any)) {
          if (Array.isArray(struct)) {
            this._context[type][name] = struct;
          } else {
            const builtinDefaultValue = this._context[type]?.default;
            const definedDefaultValue = (structs as any)?.["default"];
            const builtinDefaultProps = getAllProperties(builtinDefaultValue);
            const definedDefaultProps = getAllProperties(definedDefaultValue);
            const constructed = {} as any;
            for (const [propPath, propValue] of Object.entries(
              builtinDefaultProps
            )) {
              setProperty(constructed, propPath, propValue);
            }
            for (const [propPath, propValue] of Object.entries(
              definedDefaultProps
            )) {
              setProperty(constructed, propPath, propValue);
            }
            for (const [propPath, propValue] of Object.entries(
              getAllProperties(struct)
            )) {
              setProperty(constructed, propPath, propValue);
            }
            constructed["$type"] = type;
            constructed["$name"] = name;
            this._context[type][name] = constructed;
          }
        }
      }
    }
    // console.log("context", this._context);
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async init(config: {
    send: (message: Message, transfer?: ArrayBuffer[]) => void;
    resolve: (path: string) => string;
    fetch: (url: string) => Promise<string | ArrayBuffer>;
    log: (message: unknown, severity: "info" | "warning" | "error") => void;
  }): Promise<void> {
    this._connection.connectOutput(config.send);
    this._context.system.resolve = config.resolve;
    this._context.system.fetch = config.fetch;
    this._context.system.log = config.log;
    this._context.system.initialized = true;
    await Promise.all(this._moduleNames.map((k) => this._modules[k]?.onInit()));
  }

  start(save: string = ""): void {
    this._context.system.previewing = false;
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
    const checkpointId = ""; // TODO: update with tag (# id:<uuid>)
    for (const k of this._moduleNames) {
      this._modules[k]?.onCheckpoint(checkpointId);
    }
    this._latestCheckpointId = checkpointId;
    this._latestCheckpointData = this._story.state.ToJson();
    // console.warn(JSON.stringify(this._latestCheckpointData));
    // TODO: this._latestCheckpointData = this.serialize();
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
    if (this.module.interpreter.canFlush()) {
      this.checkpoint();
      const instructions = this.module.interpreter.flush();
      if (instructions) {
        const checkpoint = instructions.checkpoint ?? "";
        const [fileIndexArg, lineIndexArg] = checkpoint.split(";");
        const fileIndex = Number(fileIndexArg);
        const lineIndex = Number(lineIndexArg);
        const file = this._files[fileIndex];
        const line = lineIndex;
        const source = { file, line };
        this.connection.emit(WillExecuteMessage.type.notification({ source }));
        this._coordinator = new Coordinator(this, instructions);
        this.connection.emit(DidExecuteMessage.type.notification({ source }));
      }
    } else if (this._story.canContinue) {
      this._story.Continue();
      const currentText = this._story.currentText || "";
      const currentChoices = this._story.currentChoices.map((c) => c.text);
      this.module.interpreter.queue(currentText, currentChoices);
      this.continue();
    }
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

  preview(checkpointId: string): void {
    this._context.system.previewing = true;
    // TODO:
    // this._story.ChoosePathString(closestKnot);
    // continue() until we reach checkpoint
    // save then load
    for (const k of this._moduleNames) {
      this._modules[k]?.onPreview(checkpointId);
    }
  }
}
