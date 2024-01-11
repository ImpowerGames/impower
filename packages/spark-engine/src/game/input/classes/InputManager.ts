import { GameEvent2 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";

export interface InputEvents extends Record<string, GameEvent> {
  onPointerDown: GameEvent2<number, string>;
  onPointerUp: GameEvent2<number, string>;
}

export interface InputConfig {}

export interface InputState {}

export class InputManager extends Manager<
  InputEvents,
  InputConfig,
  InputState
> {
  constructor(
    environment: Environment,
    config?: Partial<InputConfig>,
    state?: Partial<InputState>
  ) {
    const initialEvents: InputEvents = {
      onPointerDown: new GameEvent2<number, string>(),
      onPointerUp: new GameEvent2<number, string>(),
    };
    const initialConfig: InputConfig = { ...(config || {}) };
    const initialState: InputState = { ...(state || {}) };
    super(environment, initialEvents, initialConfig, initialState);
  }

  pointerDown(button: number, target?: string): void {
    this._events.onPointerDown.dispatch(button, target || "");
  }

  pointerUp(button: number, target?: string): void {
    this._events.onPointerUp.dispatch(button, target || "");
  }
}
