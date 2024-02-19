import { AudioManager } from "../../modules/audio";
import { DebugManager } from "../../modules/debug";
import { LogicConfig, LogicManager } from "../../modules/logic";
import { UIConfig, UIManager } from "../../modules/ui";
import { WriterManager } from "../../modules/writer";
import { GameContext } from "../types/GameContext";
import { InstanceMap } from "../types/InstanceMap";
import { Message } from "../types/Message";
import { NotificationMessage } from "../types/NotificationMessage";
import { RecursivePartial } from "../types/RecursivePartial";
import { RecursiveReadonly } from "../types/RecursiveReadonly";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { clone } from "../utils/clone";
import { evaluate } from "../utils/evaluate";
import { resolve } from "../utils/resolve";
import { setProperty } from "../utils/setProperty";
import { uuid } from "../utils/uuid";
import { Connection } from "./Connection";
import { Manager } from "./Manager";

const DEFAULT_MODULES = {
  logic: LogicManager,
  ui: UIManager,
  debug: DebugManager,
  audio: AudioManager,
  writer: WriterManager,
} as const;

export type DefaultModuleConstructors = typeof DEFAULT_MODULES;

export type GameModules = InstanceMap<DefaultModuleConstructors>;

export interface DefaultConfigMap extends Partial<Record<string, object>> {
  logic?: LogicConfig;
  ui?: UIConfig;
}

export type GameConfig = DefaultConfigMap;

export class Game<CustomModules extends { [name: string]: Manager } = {}> {
  protected _destroyed = false;

  protected _context: GameContext;
  get context() {
    return this._context as RecursiveReadonly<GameContext>;
  }

  protected _latestCheckpointId = "";
  get latestCheckpointId() {
    return this._latestCheckpointId;
  }

  protected _latestCheckpointData = "";
  get latestCheckpointData() {
    return this._latestCheckpointData;
  }

  protected _managers: Record<string, Manager> = {};
  get module() {
    return this._managers as GameModules & CustomModules;
  }

  protected _connection: Connection;
  get connection() {
    return this._connection;
  }

  protected _moduleNames: string[];

  protected _stored: string[];

  constructor(
    context?: RecursivePartial<GameContext>,
    modules?: {
      [name in keyof CustomModules]: abstract new (
        ...args: any
      ) => CustomModules[name];
    }
  ) {
    this._context = resolve(clone({ ...(context || {}) })) as GameContext;
    this._context.system ??= {} as any;
    this._context.system.initialized = false;
    this._context.system.transitions ??= true;
    this._context.system.checkpoint ??= (id: string) => this.checkpoint(id);
    this._context.system.restore ??= () => this.restore();
    (this._context.system.supports ??= (module: string) =>
      this.supports(module)),
      (this._context.system.uuid ??= () => uuid());
    this._stored = this._context.system?.stored || [];
    this._connection = new Connection({
      onReceive: (msg) => this.onReceive(msg),
    });
    const allModules = {
      ...DEFAULT_MODULES,
      ...modules,
    };
    if (allModules) {
      Object.keys(allModules).forEach((key) => {
        const name = key as keyof typeof allModules;
        const ctr = allModules[name];
        if (ctr) {
          this._managers[name] = new ctr(this._context, this._connection);
        }
      });
    }
    this._moduleNames = Object.keys(this._managers);
  }

  supports(name: string) {
    return Boolean(this._managers[name]);
  }

  init(onSend: (message: Message, transfer?: ArrayBuffer[]) => void) {
    this._connection.connectOutput(onSend);
    this._context.system.initialized = true;
    this._moduleNames.forEach((k) => this._managers[k]?.onInit());
  }

  start(): void {
    this._context.system.previewing = false;
    this._moduleNames.forEach((k) => this._managers[k]?.onStart());
  }

  update(deltaMS: number) {
    if (!this._destroyed) {
      for (let i = 0; i < this._moduleNames.length; i += 1) {
        const k = this._moduleNames[i]!;
        this._managers[k]?.onUpdate(deltaMS);
      }
    }
  }

  async restore(): Promise<void> {
    await Promise.all(
      this._moduleNames.map((k) => this._managers[k]?.onRestore())
    );
  }

  destroy(): void {
    this._destroyed = true;
    this._moduleNames.forEach((k) => this._managers[k]?.onDestroy());
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
    this._moduleNames.forEach((k) =>
      this._managers[k]?.stored?.forEach((accessPath) => {
        this.cache(saveData.context, accessPath);
      })
    );
    this._moduleNames.forEach((k) => {
      const manager = this._managers[k];
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
      this._managers[k]?.onCheckpoint(checkpointId);
    });
    this._latestCheckpointId = checkpointId;
    this._latestCheckpointData = this.serialize();
    // console.log("checkpoint", JSON.parse(this._latestCheckpointData));
  }

  preview(checkpointId: string): void {
    this._context.system.previewing = true;
    this._moduleNames.forEach((k) => {
      this._managers[k]?.onPreview(checkpointId);
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
      if (n && msg.method.startsWith(`${n}/`)) {
        const manager = this._managers[n];
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
