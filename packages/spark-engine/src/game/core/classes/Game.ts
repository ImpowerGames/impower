import { DebugConfig, DebugManager, DebugState } from "../../debug";
import { InputConfig, InputManager, InputState } from "../../input";
import { LogicConfig, LogicManager, LogicState } from "../../logic";
import { PhysicsConfig, PhysicsManager, PhysicsState } from "../../physics";
import { SoundConfig, SoundManager, SoundState } from "../../sound";
import { TickerConfig, TickerManager, TickerState } from "../../ticker";
import { UIConfig, UIManager, UIState } from "../../ui";
import { UUIDConfig, UUIDManager, UUIDState } from "../../uuid";
import { WorldConfig, WorldManager, WorldState } from "../../world";
import { WriterConfig, WriterManager, WriterState } from "../../writer";
import { GameContext } from "../types/GameContext";
import { ListenOnly } from "../types/ListenOnly";
import { RecursiveReadonly } from "../types/RecursiveReadonly";
import { clone } from "../utils/clone";
import { evaluate } from "../utils/evaluate";
import { setProperty } from "../utils/setProperty";
import { GameEvent } from "./GameEvent";
import { GameEvent0 } from "./GameEvent0";
import { GameEvent1 } from "./GameEvent1";
import { GameEvent2 } from "./GameEvent2";
import { Manager } from "./Manager";

export interface GameEvents extends Record<string, GameEvent> {
  onStart: GameEvent0;
  onUpdate: GameEvent1<number>;
  onDestroy: GameEvent0;
  onCheckpoint: GameEvent2<string, string>;
  onReload: GameEvent1<GameState>;
}

export interface GameConfig {
  ticker?: Partial<TickerConfig>;
  uuid?: Partial<UUIDConfig>;
  ui?: Partial<UIConfig>;
  logic?: Partial<LogicConfig>;
  debug?: Partial<DebugConfig>;
  input?: Partial<InputConfig>;
  sound?: Partial<SoundConfig>;
  writer?: Partial<WriterConfig>;
  world?: Partial<WorldConfig>;
  physics?: Partial<PhysicsConfig>;

  stored?: string[];
}

export interface GameState {
  ticker?: Partial<TickerState>;
  uuid?: Partial<UUIDState>;
  ui?: Partial<UIState>;
  logic?: Partial<LogicState>;
  debug?: Partial<DebugState>;
  input?: Partial<InputState>;
  sound?: Partial<SoundState>;
  writer?: Partial<WriterState>;
  world?: Partial<WorldState>;
  physics?: Partial<PhysicsState>;

  context?: GameContext;
}

export class Game {
  ticker: TickerManager;

  uuid: UUIDManager;

  logic: LogicManager;

  ui: UIManager;

  debug: DebugManager;

  input: InputManager;

  sound: SoundManager;

  writer: WriterManager;

  world: WorldManager;

  physics: PhysicsManager;

  protected _destroyed = false;

  protected _context: GameContext;
  get context() {
    return this._context as RecursiveReadonly<GameContext>;
  }

  protected _events: GameEvents = {
    onStart: new GameEvent0(),
    onUpdate: new GameEvent1(),
    onDestroy: new GameEvent0(),
    onCheckpoint: new GameEvent2(),
    onReload: new GameEvent1(),
  };

  public get events(): ListenOnly<GameEvents> {
    return this._events;
  }

  protected _latestCheckpointId = "";
  get latestCheckpointId() {
    return this._latestCheckpointId;
  }

  protected _latestCheckpointData = "";
  get latestCheckpointData() {
    return this._latestCheckpointData;
  }

  protected _managers: Record<string, Manager>;

  protected _managerNames: string[];

  protected _stored: string[];

  constructor(
    context?: GameContext,
    config?: Partial<GameConfig>,
    state?: Partial<GameState>
  ) {
    const c = config;
    const s = clone(state);
    this._stored = config?.stored || [];
    this._context = clone(context || {}, s?.context);
    this._context.game ??= {};
    this._context.game.checkpoint = (id: string) => this.checkpoint(id);
    this._context.game.supports = (module: string) => this.supports(module);
    this.ticker = new TickerManager(this._context, c?.ticker, s?.ticker);
    this.uuid = new UUIDManager(this._context, c?.uuid, s?.uuid);
    this.logic = new LogicManager(this._context, c?.logic, s?.logic);
    this.ui = new UIManager(this._context, c?.ui, s?.ui);
    this.debug = new DebugManager(this._context, c?.debug, s?.debug);
    this.input = new InputManager(this._context, c?.input, s?.input);
    this.sound = new SoundManager(this._context, c?.sound, s?.sound);
    this.writer = new WriterManager(this._context, c?.writer, s?.writer);
    this.world = new WorldManager(this._context, c?.world, s?.world);
    this.physics = new PhysicsManager(this._context, c?.physics, s?.physics);
    this._managers = {
      ticker: this.ticker,
      uuid: this.uuid,
      logic: this.logic,
      ui: this.ui,
      debug: this.debug,
      input: this.input,
      sound: this.sound,
      writer: this.writer,
      world: this.world,
      physics: this.physics,
    };
    this._managerNames = Object.keys(this._managers);
  }

  support(name: string, manager: Manager) {
    this._managers[name] = manager;
  }

  supports(name: string) {
    return Boolean(this._managers[name]);
  }

  start(): void {
    this._context.game ??= {};
    this._context.game.previewing = false;
    this._managerNames.forEach((k) => this._managers[k]?.onStart());
    this._events.onStart.dispatch();
  }

  update(deltaMS: number) {
    if (!this._destroyed) {
      for (let i = 0; i < this._managerNames.length; i += 1) {
        const k = this._managerNames[i]!;
        if (this._managers[k]?.onUpdate(deltaMS) === null) {
          this.reload();
          this.destroy();
          return;
        }
      }
      this._events.onUpdate.dispatch(deltaMS);
    }
  }

  reload(): void {
    this._events.onReload.dispatch(JSON.parse(this._latestCheckpointData));
  }

  destroy(): void {
    this._destroyed = true;
    this._events.onDestroy.dispatch();
    this._managerNames.forEach((k) => this._managers[k]?.onDestroy());
    this._managerNames = [];
    Object.values(this._events).forEach((event) => event.removeAllListeners());
  }

  serialize(): string {
    const context = {};
    this._stored.forEach((accessPath) => {
      const value = evaluate(accessPath, this._context);
      if (value !== undefined && typeof value != "function") {
        setProperty(context, accessPath, value);
      }
    });
    const saveData: Record<string, unknown> = {
      context,
    };
    this._managerNames.forEach((k) => {
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
    this._managerNames.forEach((k) => {
      this._managers[k]?.onCheckpoint(checkpointId);
    });
    this._latestCheckpointId = checkpointId;
    this._latestCheckpointData = this.serialize();
    this._events.onCheckpoint.dispatch(
      this._latestCheckpointId,
      this._latestCheckpointData
    );
    // console.log("checkpoint", JSON.parse(this._latestCheckpointData));
  }

  preview(checkpointId: string): void {
    this._context.game ??= {};
    this._context.game.previewing = true;
    this._managerNames.forEach((k) => {
      this._managers[k]?.onPreview(checkpointId);
    });
  }
}
