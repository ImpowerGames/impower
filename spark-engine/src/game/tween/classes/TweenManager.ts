import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { TweenControl } from "../types/TweenControl";
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
    time: number;
    delta: number;
  }>;
}

export interface TweenConfig {
  timings: Map<string, TweenTiming>;
}

export interface TweenState {
  time: number;
  controllers: Map<string, TweenControl>;
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
        time: number;
        delta: number;
      }>(),
    };
    const initialConfig: TweenConfig = {
      timings: new Map(),
      ...(config || {}),
    };
    const initialState: TweenState = {
      time: 0,
      controllers: new Map(),
      ...(state || {}),
    };
    super(initialEvents, initialConfig, initialState);
  }

  get(key: string): TweenTiming | undefined {
    return this._config.timings.get(key);
  }

  add(key: string, timing: TweenTiming): void {
    this._config.timings.set(key, timing);
    this._state.controllers.set(key, {
      paused: false,
      finished: false,
      delayTime: 0,
      durationTime: 0,
    });
    this._events.onAdded.emit({ key });
  }

  remove(key: string): void {
    this._config.timings.delete(key);
    this._state.controllers.delete(key);
    this._events.onRemoved.emit({ key });
  }

  tick(time: number, delta: number): void {
    this._state.time = time;
    this._state.controllers.forEach((controller, key) => {
      const timing = this._config.timings.get(key);
      if (!controller.paused && timing?.duration) {
        const delay = timing.delay || 0;
        const duration = timing.duration || 0;
        if (controller.delayTime > delay) {
          const progress = Math.min(
            timing.loop
              ? (controller.durationTime % duration) / duration
              : controller.durationTime / duration,
            1
          );
          if (!controller.finished) {
            timing.callback?.(progress);
            if (!timing.loop && progress >= 1) {
              controller.finished = true;
            }
          }
          if (controller.durationTime <= duration) {
            controller.durationTime += delta;
          }
        }
        if (controller.delayTime <= delay) {
          controller.delayTime += delta;
        }
      }
    });
    this._events.onTick.emit({ time, delta });
  }
}
