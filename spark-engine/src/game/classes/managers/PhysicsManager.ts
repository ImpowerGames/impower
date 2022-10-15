import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

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

  setTimeScale(timeScale: number): void {
    this.events.onTimeScaleChange.emit({ timeScale });
  }
}
