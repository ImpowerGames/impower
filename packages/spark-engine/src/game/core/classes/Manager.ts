import { Environment } from "../types/Environment";
import { IGameEvent } from "../types/IGameEvent";
import { ListenOnly } from "../types/ListenOnly";
import { RecursiveReadonly } from "../types/RecursiveReadonly";
import { GameEvent } from "./GameEvent";

export abstract class Manager<
  E extends Record<string, IGameEvent> = any,
  C = any,
  S = any
> {
  protected _environment: Environment;
  public get environment(): Environment {
    return this._environment;
  }

  protected _events: E;
  public get events(): ListenOnly<E> {
    return this._events;
  }

  protected _config: RecursiveReadonly<C>;

  protected _state: S;
  public get state(): RecursiveReadonly<S> {
    return this._state as RecursiveReadonly<S>;
  }

  constructor(environment: Environment, events: E, config: C, state: S) {
    this._environment = environment;
    this._events = events;
    this._config = config as RecursiveReadonly<C>;
    this._state = state;
  }

  onInit(): void {}

  update(_deltaMS: number): boolean {
    return true;
  }

  onDestroy(): void {
    Object.values(this.events as unknown as Record<string, GameEvent>).forEach(
      (event) => {
        event.removeAllListeners();
      }
    );
  }

  onSerialize() {
    // executed before manager state is serialized
  }

  onCheckpoint(_id: string) {
    // executed before game is checkpointed
  }
}
