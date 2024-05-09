import { AudioModule } from "../../modules/audio/classes/AudioModule";
import { DebugModule } from "../../modules/debug/classes/DebugModule";
import {
  LogicConfig,
  LogicModule,
} from "../../modules/logic/classes/LogicModule";
import { UIConfig, UIModule } from "../../modules/ui/classes/UIModule";
import { WriterModule } from "../../modules/writer/classes/WriterModule";
import { GameContext } from "../types/GameContext";
import { InstanceMap } from "../types/InstanceMap";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RecursivePartial } from "../types/RecursivePartial";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { evaluate } from "../utils/evaluate";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Module } from "./Module";

const DEFAULT_MODULES = {
  logic: LogicModule,
  ui: UIModule,
  debug: DebugModule,
  audio: AudioModule,
  writer: WriterModule,
} as const;

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export interface DefaultConfigMap extends Partial<Record<string, object>> {
  logic?: LogicConfig;
  ui?: UIConfig;
}

export type GameConfig = DefaultConfigMap;

export class Game<CustomModules extends { [name: string]: Module } = {}> {
  protected _destroyed = false;

  protected _builtins: { [key: string]: any } = {};
  get builtins() {
    return this._builtins;
  }

  protected _context: GameContext = {} as GameContext;
  get context() {
    return this._context;
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
    return this._modules as GameModules & CustomModules;
  }

  protected _moduleNames: string[];

  protected _connection: Connection;
  get connection() {
    return this._connection;
  }

  protected _stored: string[] = [];
  public get stored() {
    return this._stored;
  }

  constructor(
    context?: RecursivePartial<GameContext>,
    modules?: {
      [name in keyof CustomModules]: abstract new (
        ...args: any
      ) => CustomModules[name];
    }
  ) {
    this._context = JSON.parse(JSON.stringify(context || {}));
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });
    const allModules = {
      ...DEFAULT_MODULES,
      ...modules,
    };
    const moduleNames = Object.keys(allModules);
    moduleNames.forEach((key) => {
      const name = key as keyof typeof allModules;
      const ctr = allModules[name];
      if (ctr) {
        this._modules[name] = new ctr(this);
      }
    });
    moduleNames.forEach((key) => {
      const name = key as keyof typeof allModules;
      const module = this._modules[name];
      if (module) {
        const moduleBuiltins = module.getBuiltins();
        if (moduleBuiltins) {
          Object.entries(moduleBuiltins).forEach(([k, v]) => {
            if (v && typeof v === "object" && !Array.isArray(v)) {
              this._builtins[k] ??= {};
              this._context[k] ??= {};
              Object.entries(v).forEach(([name, value]) => {
                if (this._context[k][name] === undefined) {
                  this._context[k][name] = value;
                  this._builtins[k][name] = value;
                }
              });
            } else {
              if (this._context[k] === undefined) {
                this._context[k] = v;
                this._builtins[k] = v;
              }
            }
          });
        }
        const moduleStored = module.getStored();
        if (moduleStored) {
          this._stored.push(...moduleStored);
        }
        const moduleCommands = module.getCommands();
        if (moduleCommands) {
          this.module.logic.registerRunners(moduleCommands);
        }
      }
    });
    this._moduleNames = moduleNames;

    this._context.system ??= {} as any;
    this._context.system.initialized = false;
    this._context.system.transitions ??= true;
    this._context.system.checkpoint ??= (id: string) => this.checkpoint(id);
    this._context.system.restore ??= () => this.restore();
    (this._context.system.supports ??= (module: string) =>
      this.supports(module)),
      (this._context.system.uuid ??= () => uuid());
    this._context.system.evaluate ??= (expression: string) =>
      this.module.logic.evaluate(expression);
    if (this._context.system?.stored) {
      this._context.system.stored.forEach((prop) => {
        this._stored.push(prop);
      });
    }
  }

  supports(name: string): boolean {
    return Boolean(this._modules[name]);
  }

  async init(config: {
    send: (message: Message, transfer?: ArrayBuffer[]) => void;
    resolve: (path: string) => string;
    fetch: (url: string) => Promise<string | ArrayBuffer>;
  }): Promise<void> {
    this._connection.connectOutput(config.send);
    this._context.system.resolve = config.resolve;
    this._context.system.fetch = config.fetch;
    this._context.system.initialized = true;
    await Promise.all(this._moduleNames.map((k) => this._modules[k]?.onInit()));
  }

  start(): void {
    this._context.system.previewing = false;
    this._moduleNames.forEach((k) => this._modules[k]?.onStart());
  }

  update(deltaMS: number) {
    if (!this._destroyed) {
      for (let i = 0; i < this._moduleNames.length; i += 1) {
        const k = this._moduleNames[i]!;
        this._modules[k]?.onUpdate(deltaMS);
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
    this._moduleNames.forEach((k) => this._modules[k]?.onDestroy());
    this._moduleNames = [];
    this._connection.incoming.removeAllListeners();
    this._connection.outgoing.removeAllListeners();
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
    this._stored.forEach((accessPath) => {
      this.cache(saveData.context, accessPath);
    });
    this._moduleNames.forEach((k) => {
      const manager = this._modules[k];
      if (manager) {
        manager.onSerialize();
        saveData[k] = manager.state;
      }
    });
    const serialized = JSON.stringify(saveData);
    return serialized;
  }

  checkpoint(checkpointId: string): void {
    this._moduleNames.forEach((k) => {
      this._modules[k]?.onCheckpoint(checkpointId);
    });
    this._latestCheckpointId = checkpointId;
    this._latestCheckpointData = this.serialize();
    // console.log("checkpoint", JSON.parse(this._latestCheckpointData));
  }

  preview(checkpointId: string): void {
    this._context.system.previewing = true;
    this._moduleNames.forEach((k) => {
      this._modules[k]?.onPreview(checkpointId);
    });
  }

  async onReceive(
    msg: RequestMessage | NotificationMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | { transfer?: ArrayBuffer[] }
    | undefined
  > {
    for (let i = 0; i < this._moduleNames.length; i += 1) {
      const n = this._moduleNames[i];
      if (n) {
        const manager = this._modules[n];
        if (manager) {
          if ("id" in msg) {
            return manager.onReceiveRequest(msg);
          }
          manager.onReceiveNotification(msg);
        }
      }
    }
    return undefined;
  }
}
