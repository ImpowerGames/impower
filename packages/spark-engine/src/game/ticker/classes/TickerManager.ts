import { GameEvent1, GameEvent2 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";

export interface TickerEvents extends Record<string, GameEvent> {
  onAdded: GameEvent2<string, (deltaMS: number) => void>;
  onRemoved: GameEvent1<string>;
  onUpdate: GameEvent1<number>;
}

export interface TickerConfig {
  listeners: Map<string, (deltaMS: number) => void>;
}

export interface TickerState {
  elapsedMS: number;
}

export class TickerManager extends Manager<
  TickerEvents,
  TickerConfig,
  TickerState
> {
  constructor(
    environment: Environment,
    config?: Partial<TickerConfig>,
    state?: Partial<TickerState>
  ) {
    const initialEvents: TickerEvents = {
      onAdded: new GameEvent2<string, (deltaMS: number) => void>(),
      onRemoved: new GameEvent1<string>(),
      onUpdate: new GameEvent1<number>(),
    };
    const initialConfig: TickerConfig = {
      listeners: new Map(),
      ...(config || {}),
    };
    const initialState: TickerState = { elapsedMS: 0, ...(state || {}) };
    super(environment, initialEvents, initialConfig, initialState);
  }

  add(key: string, callback: (deltaMS: number) => void): void {
    this._config.listeners.set(key, callback);
    this._events.onAdded.dispatch(key, callback);
  }

  remove(key: string): void {
    this._config.listeners.delete(key);
    this._events.onRemoved.dispatch(key);
  }

  override update(deltaMS: number): void {
    super.update(deltaMS);
    this._state.elapsedMS += deltaMS;
    this._config.listeners.forEach((l) => l?.(deltaMS));
    this._events.onUpdate.dispatch(deltaMS);
  }
}
