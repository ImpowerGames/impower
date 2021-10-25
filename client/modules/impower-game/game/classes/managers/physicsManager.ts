import { Manager } from "./manager";
import { GameEvent } from "../events/gameEvent";

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface PhysicsState {}

export interface PhysicsEvents {
  onTimeScaleChange: GameEvent<{ timeScale: number }>;
}

export class PhysicsManager extends Manager<PhysicsState, PhysicsEvents> {
  getInitialState(): PhysicsState {
    return {};
  }

  getInitialEvents(): PhysicsEvents {
    return {
      onTimeScaleChange: new GameEvent<{ timeScale: number }>(),
    };
  }

  setTimeScale(data: { timeScale: number }): void {
    this.events.onTimeScaleChange.emit({ ...data });
  }
}
