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
import { Environment } from "../types/Environment";
import { ListenOnly } from "../types/ListenOnly";
import { GameEvent } from "./GameEvent";
import { GameEvent0 } from "./GameEvent0";
import { GameEvent1 } from "./GameEvent1";
import { GameEvent2 } from "./GameEvent2";
import { Manager } from "./Manager";

export interface GameEvents extends Record<string, GameEvent> {
  onInit: GameEvent0;
  onUpdate: GameEvent1<number>;
  onDestroy: GameEvent0;
  onCheckpoint: GameEvent2<string, string>;
}

export interface GameConfig {
  environment?: Partial<Environment>;
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
}

export class Game {
  environment: Environment = { simulating: false };

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

  protected _events: GameEvents = {
    onInit: new GameEvent0(),
    onUpdate: new GameEvent1(),
    onDestroy: new GameEvent0(),
    onCheckpoint: new GameEvent2(),
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

  constructor(config?: Partial<GameConfig>, state?: Partial<GameState>) {
    this.environment = { ...this.environment, ...(config?.environment || {}) };
    this.ticker = new TickerManager(
      this.environment,
      config?.ticker,
      state?.ticker
    );
    this.uuid = new UUIDManager(this.environment, config?.uuid, state?.uuid);
    this.logic = new LogicManager(
      this.environment,
      config?.logic,
      state?.logic
    );
    this.ui = new UIManager(this.environment, config?.ui, state?.ui);
    this.debug = new DebugManager(
      this.environment,
      config?.debug,
      state?.debug
    );
    this.input = new InputManager(
      this.environment,
      config?.input,
      state?.input
    );
    this.sound = new SoundManager(
      this.environment,
      config?.sound,
      state?.sound
    );
    this.writer = new WriterManager(
      this.environment,
      config?.writer,
      state?.writer
    );
    this.world = new WorldManager(
      this.environment,
      config?.world,
      state?.world
    );
    this.physics = new PhysicsManager(
      this.environment,
      config?.physics,
      state?.physics
    );
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

  init(): void {
    this._managerNames.forEach((k) => this._managers[k]?.init());
    this.ui.loadTheme(this.logic.valueMap);
    this.ui.loadStyles(this.logic.valueMap);
    this.ui.loadUI(this.logic.valueMap);
    this._events.onInit.dispatch();
  }

  update(deltaMS: number): void {
    this._managerNames.forEach((k) => {
      this._managers[k]?.update(deltaMS);
    });
    this._events.onUpdate.dispatch(deltaMS);
  }

  destroy(): void {
    this._events.onDestroy.dispatch();
    this._managerNames.forEach((k) => this._managers[k]?.destroy());
  }

  serialize(): string {
    const saveData: Record<string, unknown> = {};
    this._managerNames.forEach((k) => {
      const manager = this._managers[k];
      if (manager) {
        manager.onSerialize();
        saveData[k] = manager.state;
      }
    });
    const serialized = JSON.stringify(saveData);
    console.log(JSON.parse(serialized));
    return serialized;
  }

  checkpoint(id: string): void {
    this._managerNames.forEach((k) => {
      this._managers[k]?.onCheckpoint(id);
    });
    this._latestCheckpointId = id;
    this._latestCheckpointData = this.serialize();
    this._events.onCheckpoint.dispatch(
      this._latestCheckpointId,
      this._latestCheckpointData
    );
  }
}
