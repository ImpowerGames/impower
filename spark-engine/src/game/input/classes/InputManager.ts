import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface InputEvents extends Record<string, GameEvent> {
  onPointerDown: GameEvent<[number, string]>;
  onPointerUp: GameEvent<[number, string]>;
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
  constructor(config?: Partial<InputConfig>, state?: Partial<InputState>) {
    const initialEvents: InputEvents = {
      onPointerDown: new GameEvent<[number, string]>(),
      onPointerUp: new GameEvent<[number, string]>(),
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
    super(initialEvents, initialConfig, initialState);
  }

  pointerDown(button: number, target?: string): void {
    if (!this._state.pointer.down.includes(button)) {
      this._state.pointer.down.push(button);
    }
    const index = this._state.pointer.up.indexOf(button);
    if (index >= 0) {
      this._state.pointer.up.splice(index, 1);
    }
    this._events.onPointerDown.emit(button, target || "");
  }

  pointerUp(button: number, target?: string): void {
    if (!this._state.pointer.up.includes(button)) {
      this._state.pointer.up.push(button);
    }
    const index = this._state.pointer.down.indexOf(button);
    if (index >= 0) {
      this._state.pointer.down.splice(index, 1);
    }
    this._events.onPointerUp.emit(button, target || "");
  }
}
