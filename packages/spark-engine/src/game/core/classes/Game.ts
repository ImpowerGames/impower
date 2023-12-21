import { DebugConfig, DebugManager, DebugState } from "../../debug";
import { LogicConfig, LogicManager, LogicState } from "../../logic";
import { RandomConfig, RandomManager, RandomState } from "../../random";
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
  random?: Partial<RandomConfig>;
  logic?: Partial<LogicConfig>;
  debug?: Partial<DebugConfig>;
}

export interface GameState {
  ticker?: Partial<TickerState>;
  uuid?: Partial<UUIDState>;
  ui?: Partial<UIState>;
  random?: Partial<RandomState>;
  logic?: Partial<LogicState>;
  debug?: Partial<DebugState>;
}

export class Game {
  environment: Environment = { simulating: false };

  ticker: TickerManager;

  uuid: UUIDManager;

  random: RandomManager;

  logic: LogicManager;

  ui: UIManager;

  debug: DebugManager;

  constructor(config?: Partial<GameConfig>, state?: Partial<GameState>) {
    this.environment = { ...this.environment, ...(config?.environment || {}) };
    this.ticker = new TickerManager(
      this.environment,
      config?.ticker,
      state?.ticker
    );
    this.uuid = new UUIDManager(this.environment, config?.uuid, state?.uuid);
    this.random = new RandomManager(
      this.environment,
      config?.random,
      state?.random
    );
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
  }

  managers(): Record<string, Manager> {
    return {
      ticker: this.ticker,
      uuid: this.uuid,
      random: this.random,
      logic: this.logic,
      ui: this.ui,
      debug: this.debug,
    };
  }

  protected _events: GameEvents = {
    onInit: new GameEvent0(),
    onDestroy: new GameEvent0(),
  };

  public get events(): ListenOnly<GameEvents> {
    return this._events;
  }

  init(): void {
    Object.values(this.managers()).forEach((m) => m.init());
    this.ui.loadTheme(this.logic.valueMap);
    this.ui.loadStyles(this.logic.valueMap);
    this.ui.loadUI(this.logic.valueMap);
    this._events.onInit.dispatch();
  }

  update(deltaMS: number): void {
    Object.values(this.managers()).forEach((manager) => {
      manager.update(deltaMS);
    });
  }

  destroy(): void {
    this._events.onDestroy.dispatch();
    Object.values(this.managers()).forEach((m) => m.destroy());
  }

  serialize(): string {
    const saveData: Record<string, unknown> = {};
    Object.entries(this.managers()).forEach(([key, value]) => {
      saveData[key] = value.getSaveData();
    });
    return JSON.stringify(saveData);
  }
}
