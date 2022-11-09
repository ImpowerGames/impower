import { GameEvent } from "./GameEvent";

export abstract class Manager<E = Record<string, GameEvent>, C = any, S = any> {
  protected _events: E;

  public get events(): E {
    return this._events;
  }

  protected _config: C;

  public get config(): C {
    return this._config;
  }

  protected _state: S;

  public get state(): S {
    return this._state;
  }

  constructor(events: E, config: C, state: S) {
    this._events = events;
    this._config = config;
    this._state = state;
  }

  init(): void {}

  async start(): Promise<void> {}

  destroy(): void {
    Object.values(this.events as unknown as Record<string, GameEvent>).forEach(
      (event) => {
        event.removeAllListeners();
      }
    );
  }

  getSaveData(): S {
    return this.deepCopy(this.state);
  }

  deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
