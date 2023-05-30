import { IGameEvent } from "../types/IGameEvent";
import { ListenOnly } from "../types/ListenOnly";
import { ReadOnly } from "../types/ReadOnly";
import { GameEvent } from "./GameEvent";

export abstract class Manager<
  E extends Record<string, IGameEvent> = any,
  C = any,
  S = any
> {
  protected _events: E;

  public get events(): ListenOnly<E> {
    return this._events;
  }

  protected _config: C;

  public get config(): C {
    return this._config;
  }

  protected _state: S;

  public get state(): ReadOnly<S> {
    return this._state;
  }

  constructor(events: E, config: C, state: S) {
    this._events = events;
    this._config = config;
    this._state = state;
  }

  init(): void {}

  update(_deltaMS: number): void {}

  destroy(): void {
    Object.values(this.events as unknown as Record<string, GameEvent>).forEach(
      (event) => {
        event.removeAllListeners();
      }
    );
  }

  getSaveData(): S {
    return this.deepCopy(this.state) as S;
  }

  deepCopy<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}
