import { GameEvent } from "../../core/classes/GameEvent";
import { Manager } from "../../core/classes/Manager";

export interface InputEvents extends Record<string, GameEvent> {
  onPointerDown: GameEvent<{ button: number; target?: string }>;
  onPointerUp: GameEvent<{ button: number; target?: string }>;
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
      onPointerDown: new GameEvent<{
        button: number;
        targets?: string[];
      }>(),
      onPointerUp: new GameEvent<{ button: number; targets?: string[] }>(),
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
    if (!this.state.pointer.down.includes(button)) {
      this.state.pointer.down.push(button);
    }
    const index = this.state.pointer.up.indexOf(button);
    if (index >= 0) {
      this.state.pointer.up.splice(index, 1);
    }
    this.events.onPointerDown.emit({ button, target });
  }

  pointerUp(button: number, target?: string): void {
    if (!this.state.pointer.up.includes(button)) {
      this.state.pointer.up.push(button);
    }
    const index = this.state.pointer.down.indexOf(button);
    if (index >= 0) {
      this.state.pointer.down.splice(index, 1);
    }
    this.events.onPointerUp.emit({ button, target });
  }
}
