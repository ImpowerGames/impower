import { GameEvent } from "../GameEvent";
import { Manager } from "../Manager";

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

export interface InputEvents {
  onPointerDown: GameEvent<{ button: number; target?: string }>;
  onPointerUp: GameEvent<{ button: number; target?: string }>;
}

export class InputManager extends Manager<InputState, InputEvents> {
  getInitialState(): InputState {
    return {
      key: {
        down: [],
        up: [],
      },
      pointer: {
        down: [],
        up: [],
      },
    };
  }

  getInitialEvents(): InputEvents {
    return {
      onPointerDown: new GameEvent<{
        button: number;
        targets?: string[];
      }>(),
      onPointerUp: new GameEvent<{ button: number; targets?: string[] }>(),
    };
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
