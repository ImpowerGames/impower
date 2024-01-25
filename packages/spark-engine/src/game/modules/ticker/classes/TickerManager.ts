import { GameEvent1, GameEvent2 } from "../../../core";
import { GameEvent } from "../../../core/classes/GameEvent";
import { Manager } from "../../../core/classes/Manager";
import { GameContext } from "../../../core/types/GameContext";

export interface TickerEvents extends Record<string, GameEvent> {
  onAdded: GameEvent2<string, (deltaMS: number) => void>;
  onRemoved: GameEvent1<string>;
  onUpdate: GameEvent1<number>;
}

export interface TickerConfig {
  listeners: Map<string, (deltaMS: number) => void>;
}

export interface TickerState {}

export class TickerManager extends Manager<
  TickerEvents,
  TickerConfig,
  TickerState
> {
  constructor(
    context: GameContext,
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
    super(context, initialEvents, initialConfig, state || {});
  }

  add(key: string, callback: (deltaMS: number) => void): void {
    this._config.listeners.set(key, callback);
    this._events.onAdded.dispatch(key, callback);
  }

  remove(key: string): void {
    this._config.listeners.delete(key);
    this._events.onRemoved.dispatch(key);
  }

  override onUpdate(deltaMS: number) {
    super.onUpdate(deltaMS);
    this._config.listeners.forEach((l) => l?.(deltaMS));
    this._events.onUpdate.dispatch(deltaMS);
    return true;
  }
}
