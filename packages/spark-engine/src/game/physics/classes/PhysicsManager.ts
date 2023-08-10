import { GameEvent1 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface PhysicsEvents extends Record<string, GameEvent> {
  onTimeScaleChange: GameEvent1<number>;
}

export interface PhysicsConfig {}

export interface PhysicsState {}

export class PhysicsManager extends Manager<
  PhysicsEvents,
  PhysicsConfig,
  PhysicsState
> {
  constructor(config?: Partial<PhysicsConfig>, state?: Partial<PhysicsState>) {
    const initialEvents: PhysicsEvents = {
      onTimeScaleChange: new GameEvent1<number>(),
    };
    const initialConfig: PhysicsConfig = { ...(config || {}) };
    const initialState: PhysicsState = { ...(state || {}) };
    super(initialEvents, initialConfig, initialState);
  }

  setTimeScale(timeScale: number): void {
    this._events.onTimeScaleChange.dispatch(timeScale);
  }
}
