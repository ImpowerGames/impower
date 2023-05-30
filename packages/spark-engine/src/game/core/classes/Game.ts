import { DebugConfig, DebugManager, DebugState } from "../../debug";
import { LogicConfig, LogicManager, LogicState } from "../../logic";
import { RandomConfig, RandomManager, RandomState } from "../../random";
import { StructConfig, StructManager, StructState } from "../../struct";
import { TickerConfig, TickerManager, TickerState } from "../../ticker";
import { UIConfig, UIManager, UIState } from "../../ui";
import { ListenOnly } from "../types/ListenOnly";
import { GameEvent } from "./GameEvent";
import { Manager } from "./Manager";

export interface GameEvents extends Record<string, GameEvent> {
  onInit: GameEvent;
  onDestroy: GameEvent;
}

export interface GameConfig {
  ticker?: Partial<TickerConfig>;
  struct?: Partial<StructConfig>;
  ui?: Partial<UIConfig>;
  random?: Partial<RandomConfig>;
  logic?: Partial<LogicConfig>;
  debug?: Partial<DebugConfig>;
}

export interface GameState {
  ticker?: Partial<TickerState>;
  struct?: Partial<StructState>;
  ui?: Partial<UIState>;
  random?: Partial<RandomState>;
  logic?: Partial<LogicState>;
  debug?: Partial<DebugState>;
}

export class Game {
  ticker: TickerManager;

  struct: StructManager;

  ui: UIManager;

  random: RandomManager;

  logic: LogicManager;

  debug: DebugManager;

  constructor(config?: Partial<GameConfig>, state?: Partial<GameState>) {
    this.ticker = new TickerManager(config?.ticker, state?.ticker);
    this.struct = new StructManager(config?.struct, state?.struct);
    this.ui = new UIManager(config?.ui, state?.ui);
    this.random = new RandomManager(config?.random, state?.random);
    this.logic = new LogicManager(config?.logic, state?.logic);
    this.debug = new DebugManager(config?.debug, state?.debug);
  }

  managers(): Record<string, Manager> {
    return {
      ticker: this.ticker,
      struct: this.struct,
      ui: this.ui,
      random: this.random,
      logic: this.logic,
      debug: this.debug,
    };
  }

  protected _events: GameEvents = {
    onInit: new GameEvent(),
    onDestroy: new GameEvent(),
  };

  public get events(): ListenOnly<GameEvents> {
    return this._events;
  }

  init(): void {
    Object.values(this.managers()).forEach((m) => m.init());
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
