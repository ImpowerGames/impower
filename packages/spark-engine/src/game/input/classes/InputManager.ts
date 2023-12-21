import { GameEvent2 } from "../../core";
import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";
import { Environment } from "../../core/types/Environment";

export interface InputEvents extends Record<string, GameEvent> {
  onPointerDown: GameEvent2<number, string>;
  onPointerUp: GameEvent2<number, string>;
}

export interface InputConfig {}

export interface InputState {
  key: {
    down: string[];
    up: string[];
  };
  pointer: {
    down: number[];
    up: number[];
  };
}

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
    const initialState: InputState = {
      key: {
        down: [],
        up: [],
      },
      pointer: {
        down: [],
        up: [],
      },
      ...(state || {}),
    };
    super(environment, initialEvents, initialConfig, initialState);
  }

  pointerDown(button: number, target?: string): void {
    if (!this._state.pointer.down.includes(button)) {
      this._state.pointer.down.push(button);
    }
    const index = this._state.pointer.up.indexOf(button);
    if (index >= 0) {
      this._state.pointer.up.splice(index, 1);
    }
    this._events.onPointerDown.dispatch(button, target || "");
  }

  pointerUp(button: number, target?: string): void {
    if (!this._state.pointer.up.includes(button)) {
      this._state.pointer.up.push(button);
    }
    const index = this._state.pointer.down.indexOf(button);
    if (index >= 0) {
      this._state.pointer.down.splice(index, 1);
    }
    this._events.onPointerUp.dispatch(button, target || "");
  }
}
