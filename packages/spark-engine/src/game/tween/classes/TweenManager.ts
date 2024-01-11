import { GameEvent1, interpolate } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";
import { TweenTiming } from "../types/TweenTiming";

export interface TweenEvents extends Record<string, GameEvent> {
  onAdded: GameEvent1<string>;
  onRemoved: GameEvent1<string>;
  onUpdate: GameEvent1<number>;
}

export interface TweenConfig {}

export interface TweenState {}

export class TweenManager extends Manager<
  TweenEvents,
  TweenConfig,
  TweenState
> {
  protected _elapsedMS = 0;

  protected _timings = new Map<string, TweenTiming>();

  constructor(
    environment: Environment,
    config?: Partial<TweenConfig>,
    state?: Partial<TweenState>
  ) {
    const initialEvents: TweenEvents = {
      onAdded: new GameEvent1<string>(),
      onRemoved: new GameEvent1<string>(),
      onUpdate: new GameEvent1<number>(),
    };
    const initialConfig: TweenConfig = {
      timings: new Map(),
      ...(config || {}),
    };
    const initialState: TweenState = { ...(state || {}) };
    super(environment, initialEvents, initialConfig, initialState);
  }

  get(key: string): TweenTiming | undefined {
    return this._timings.get(key);
  }

  add(key: string, timing: TweenTiming): void {
    this._timings.set(key, timing);
    this._events.onAdded.dispatch(key);
  }

  remove(key: string): void {
    this._timings.delete(key);
    this._events.onRemoved.dispatch(key);
  }

  override update(deltaMS: number): void {
    this._elapsedMS += deltaMS;
    this._timings.forEach((timing) => {
      const delayMS = (timing.delay ?? 0) * 1000;
      const durationMS = (timing.duration ?? 0) * 1000;
      const tweenElapsedMS = this._elapsedMS - delayMS;
      const iteration = tweenElapsedMS / durationMS;
      const tween = (
        a: number,
        b: number,
        p?: number,
        e?: (p: number) => number
      ) => interpolate(p ?? iteration, a, b, e ?? timing.ease);
      timing.on?.(tween, iteration);
    });
    this._events.onUpdate.dispatch(deltaMS);
  }
}
