import { isGameEvent } from "../events/gameEvent";

export abstract class Manager<S = unknown, E = unknown> {
  private _started: boolean;

  public get started(): boolean {
    return this._started;
  }

  protected _state: S;

  public get state(): S {
    return this._state;
  }

  protected _events: E;

  public get events(): E {
    return this._events;
  }

  constructor(state?: S) {
    this._started = false;
    const initialState = { ...this.getInitialState(), ...state };
    this._state = this.deepCopyState(initialState);
    this._events = this.getInitialEvents();
  }

  protected abstract getInitialState(): S;

  protected abstract getInitialEvents(): E;

  initializeState(): void {
    this._state = this.getInitialState();
  }

  loadState(state: S): void {
    this._state = state;
  }

  start(): void {
    this._started = true;
  }

  destroy(): void {
    Object.values(this.events).forEach((event) => {
      if (isGameEvent(event)) {
        event.removeAllListeners();
      }
    });
  }

  getSaveData(): S {
    return this.deepCopyState(this.state);
  }

  deepCopyState(state: S): S {
    return JSON.parse(JSON.stringify(state));
  }
}
