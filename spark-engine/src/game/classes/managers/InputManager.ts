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
  onPointerDown: GameEvent<{ button: number; targets: string[] }>;
  onPointerUp: GameEvent<{ button: number; targets: string[] }>;
  onEmptyPhaserClickDown: GameEvent<{ event: unknown }>;
  onEmptyPhaserClickUp: GameEvent<{ event: unknown }>;
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
        targets: string[];
      }>(),
      onPointerUp: new GameEvent<{ button: number; targets: string[] }>(),
      onEmptyPhaserClickDown: new GameEvent<{ event: unknown }>(),
      onEmptyPhaserClickUp: new GameEvent<{ event: unknown }>(),
    };
  }

  pointerDown(data: { button: number; targets: string[] }): void {
    if (!this.state.pointer.down.includes(data.button)) {
      this.state.pointer.down.push(data.button);
    }
    const index = this.state.pointer.up.indexOf(data.button);
    if (index >= 0) {
      this.state.pointer.up.splice(index, 1);
    }
    this.events.onPointerDown.emit({ ...data });
  }

  pointerUp(data: { button: number; targets: string[] }): void {
    if (!this.state.pointer.up.includes(data.button)) {
      this.state.pointer.up.push(data.button);
    }
    const index = this.state.pointer.down.indexOf(data.button);
    if (index >= 0) {
      this.state.pointer.down.splice(index, 1);
    }
    this.events.onPointerUp.emit({ ...data });
  }

  emptyPhaserClickDown(data: { event: unknown }): void {
    this.events.onEmptyPhaserClickDown.emit({ ...data });
  }

  emptyPhaserClickUp(data: { event: unknown }): void {
    this.events.onEmptyPhaserClickUp.emit({ ...data });
  }
}
