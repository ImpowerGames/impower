import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface TickerEvents extends Record<string, GameEvent> {
  onAdd: GameEvent<{
    key: string;
    callback: (timeMS: number, deltaMS: number) => void;
  }>;
  onRemove: GameEvent<{
    key: string;
  }>;
  onTick: GameEvent<{
    timeMS: number;
    deltaMS: number;
  }>;
}

export interface TickerConfig {
  listeners: Map<string, (timeMS: number, deltaMS: number) => void>;
}

export interface TickerState {}

export class TickerManager extends Manager<
  TickerEvents,
  TickerConfig,
  TickerState
> {
  constructor(config?: Partial<TickerConfig>, state?: Partial<TickerState>) {
    const initialEvents: TickerEvents = {
      onAdd: new GameEvent<{
        key: string;
        callback: (timeMS: number, deltaMS: number) => void;
      }>(),
      onRemove: new GameEvent<{
        key: string;
      }>(),
      onTick: new GameEvent<{
        timeMS: number;
        deltaMS: number;
      }>(),
    };
    const initialConfig: TickerConfig = {
      listeners: new Map(),
      ...(config || {}),
    };
    const initialState: TickerState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  add(key: string, callback: (timeMS: number, deltaMS: number) => void): void {
    this._config.listeners.set(key, callback);
    this._events.onAdd.emit({ key, callback });
  }

  remove(key: string): void {
    this._config.listeners.delete(key);
    this._events.onRemove.emit({ key });
  }

  tick(timeMS: number, deltaMS: number): void {
    this._config.listeners.forEach((l) => l?.(timeMS, deltaMS));
    this._events.onTick.emit({ timeMS, deltaMS });
  }
}
