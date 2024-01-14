import { GameContext } from "../types/GameContext";
import { IGameEvent } from "../types/IGameEvent";
import { ListenOnly } from "../types/ListenOnly";
import { RecursiveReadonly } from "../types/RecursiveReadonly";

export abstract class Manager<
  E extends Record<string, IGameEvent> = any,
  C = any,
  S = any
> {
  protected _context: GameContext;

  protected _events: E;
  public get events(): ListenOnly<E> {
    return this._events;
  }

  protected _config: RecursiveReadonly<C>;

  protected _state: S;
  public get state(): RecursiveReadonly<S> {
    return this._state as RecursiveReadonly<S>;
  }

  constructor(context: GameContext, events: E, config: C, state: S) {
    this._context = context;
    this._events = events;
    this._config = config as RecursiveReadonly<C>;
    this._state = state;
  }

  onStart(): void {}

  update(_deltaMS: number): null | boolean {
    return true;
  }

  onDestroy(): void {
    Object.values(this._events).forEach((event) => {
      event.removeAllListeners();
    });
  }

  onSerialize() {
    // executed before manager state is serialized
  }

  onCheckpoint(_id: string) {
    // executed before game is checkpointed
  }
}
