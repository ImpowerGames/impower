import { DebugConfig, DebugManager, DebugState } from "../../debug";
import { LogicConfig, LogicManager, LogicState } from "../../logic";
import { TickerConfig, TickerManager, TickerState } from "../../ticker";
import { UIConfig, UIManager, UIState } from "../../ui";
import { UUIDConfig, UUIDManager, UUIDState } from "../../uuid";
import { Environment } from "../types/Environment";
import { ListenOnly } from "../types/ListenOnly";
import { GameEvent } from "./GameEvent";
import { GameEvent0 } from "./GameEvent0";
import { Manager } from "./Manager";

export interface GameEvents extends Record<string, GameEvent> {
  onInit: GameEvent0;
  onDestroy: GameEvent0;
}

export interface GameConfig {
  environment?: Partial<Environment>;
  ticker?: Partial<TickerConfig>;
  uuid?: Partial<UUIDConfig>;
  ui?: Partial<UIConfig>;
  logic?: Partial<LogicConfig>;
  debug?: Partial<DebugConfig>;
}

export interface GameState {
  ticker?: Partial<TickerState>;
  uuid?: Partial<UUIDState>;
  ui?: Partial<UIState>;
  logic?: Partial<LogicState>;
  debug?: Partial<DebugState>;
}

export class Game {
  environment: Environment = { simulating: false };

  ticker: TickerManager;

  uuid: UUIDManager;

  logic: LogicManager;

  ui: UIManager;

  debug: DebugManager;

  protected _events: GameEvents = {
    onInit: new GameEvent0(),
    onDestroy: new GameEvent0(),
  };

  public get events(): ListenOnly<GameEvents> {
    return this._events;
  }

  protected _managers: Record<string, Manager>;

  protected _managerNames: string[];

  protected _latestCheckpointId: string;

  protected _latestCheckpointData: string;

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
    this._managers = this.managers();
    this._managerNames = Object.keys(this._managers);
    this._latestCheckpointId = "";
    this._latestCheckpointData = this.serialize();
  }

  managers(): Record<string, Manager> {
    return {
      ticker: this.ticker,
      uuid: this.uuid,
      logic: this.logic,
      ui: this.ui,
      debug: this.debug,
    };
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
    // console.log(JSON.parse(serialized));
    return serialized;
  }

  checkpoint(id: string): void {
    this._managerNames.forEach((k) => {
      this._managers[k]?.onCheckpoint(id);
    });
    this._latestCheckpointId = id;
    this._latestCheckpointData = this.serialize();
  }
}
