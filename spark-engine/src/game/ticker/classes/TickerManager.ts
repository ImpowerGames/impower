import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface TickerEvents extends Record<string, GameEvent> {
  onAdd: GameEvent<{
    key: string;
    callback: (deltaMS: number) => void;
  }>;
  onRemove: GameEvent<{
    key: string;
  }>;
  onTick: GameEvent<{
    deltaMS: number;
  }>;
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
  constructor(config?: Partial<TickerConfig>, state?: Partial<TickerState>) {
    const initialEvents: TickerEvents = {
      onAdd: new GameEvent<{
        key: string;
        callback: (deltaMS: number) => void;
      }>(),
      onRemove: new GameEvent<{
        key: string;
      }>(),
      onTick: new GameEvent<{
        deltaMS: number;
      }>(),
    };
    const initialConfig: TickerConfig = {
      listeners: new Map(),
      ...(config || {}),
    };
    const initialState: TickerState = { elapsedMS: 0, ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  add(key: string, callback: (deltaMS: number) => void): void {
    this._config.listeners.set(key, callback);
    this._events.onAdd.emit({ key, callback });
  }

  remove(key: string): void {
    this._config.listeners.delete(key);
    this._events.onRemove.emit({ key });
  }

  tick(deltaMS: number): void {
    this._state.elapsedMS += deltaMS;
    this._config.listeners.forEach((l) => l?.(deltaMS));
    this._events.onTick.emit({ deltaMS });
  }
}
