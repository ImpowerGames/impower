import { interpolate } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { TweenTiming } from "../types/TweenTiming";

export interface TweenEvents extends Record<string, GameEvent> {
  onAdded: GameEvent<{
    key: string;
  }>;
  onRemoved: GameEvent<{
    key: string;
  }>;
  onPaused: GameEvent<{
    key: string;
  }>;
  onUnpaused: GameEvent<{
    key: string;
  }>;
  onStopped: GameEvent<{
    key: string;
  }>;
  onFinished: GameEvent<{
    key: string;
  }>;
  onLooped: GameEvent<{
    key: string;
  }>;
  onTick: GameEvent<{
    deltaMS: number;
  }>;
}

export interface TweenConfig {
  timings: Map<string, TweenTiming>;
}

export interface TweenState {
  elapsedMS: number;
}

export class TweenManager extends Manager<
  TweenEvents,
  TweenConfig,
  TweenState
> {
  constructor(config?: Partial<TweenConfig>, state?: Partial<TweenState>) {
    const initialEvents: TweenEvents = {
      onAdded: new GameEvent<{
        key: string;
      }>(),
      onRemoved: new GameEvent<{
        key: string;
      }>(),
      onPaused: new GameEvent<{
        key: string;
      }>(),
      onUnpaused: new GameEvent<{
        key: string;
      }>(),
      onStopped: new GameEvent<{
        key: string;
      }>(),
      onFinished: new GameEvent<{
        key: string;
      }>(),
      onLooped: new GameEvent<{
        key: string;
      }>(),
      onTick: new GameEvent<{
        deltaMS: number;
      }>(),
    };
    const initialConfig: TweenConfig = {
      timings: new Map(),
      ...(config || {}),
    };
    const initialState: TweenState = {
      elapsedMS: 0,
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  get(key: string): TweenTiming | undefined {
    return this._config.timings.get(key);
  }

  add(key: string, timing: TweenTiming): void {
    this._config.timings.set(key, timing);
    this._events.onAdded.emit({ key });
  }

  remove(key: string): void {
    this._config.timings.delete(key);
    this._events.onRemoved.emit({ key });
  }

  protected clamp(x: number): number {
    const min = 0;
    const max = 1;
    if (x < min) {
      return min;
    }
    if (x > max) {
      return max;
    }
    return x;
  }

  tick(deltaMS: number): void {
    this._state.elapsedMS += deltaMS;
    this._config.timings.forEach((timing) => {
      const delayMS = (timing.delay ?? 0) * 1000;
      const durationMS = (timing.duration ?? 0) * 1000;
      const tweenElapsedMS = this._state.elapsedMS - delayMS;
      const iteration = tweenElapsedMS / durationMS;
      if (timing.loop || iteration <= 1) {
        const tween = (
          a: number,
          b: number,
          p?: number,
          e?: (p: number) => number
        ) => interpolate(p ?? iteration, a, b, e ?? timing.ease);
        timing.on?.(tween, iteration);
      }
    });
    this._events.onTick.emit({ deltaMS });
  }
}
