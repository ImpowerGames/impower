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

  protected _stored: string[];
  public get stored(): readonly string[] {
    return this._stored;
  }

  protected _triggerReady: Map<number, () => void> = new Map();

  protected _triggersCreated = 0;

  constructor(
    context: GameContext,
    events: E,
    config: C,
    state: S,
    stored: string[] = []
  ) {
    this._context = context;
    this._events = events;
    this._config = config as RecursiveReadonly<C>;
    this._state = state;
    this._stored = stored;
  }

  protected nextTriggerId() {
    this._triggersCreated += 1;
    if (
      this._triggersCreated <= 0 ||
      this._triggersCreated >= Number.MAX_SAFE_INTEGER
    ) {
      this._triggersCreated = 1;
    }
    return this._triggersCreated;
  }

  protected enableTrigger(triggerId: number, callback: () => void) {
    this._triggerReady.set(triggerId, callback);
  }

  isReady(triggerId: number) {
    return Boolean(this._triggerReady.has(triggerId));
  }

  trigger(triggerId: number) {
    const t = this._triggerReady.get(triggerId);
    if (t) {
      t();
    }
  }

  triggerAll(transitionIds: number[]) {
    transitionIds.forEach((transitionId) => {
      this.trigger(transitionId);
    });
  }

  onStart(): void {}

  onUpdate(_deltaMS: number): null | boolean {
    return true;
  }

  onDestroy(): void {
    Object.values(this._events).forEach((event) => {
      event.removeAllListeners();
    });
  }

  async onRestore() {
    // restores from current state after instant skipping
  }

  onSerialize() {
    // executed before manager state is serialized
  }

  onCheckpoint(_checkpointId: string) {
    // executed before game is serialized
  }

  onPreview(_checkpointId: string) {
    // executed when game is previewed at a specific checkpoint location
  }
}
