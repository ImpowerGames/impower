import { GameContext } from "../types/GameContext";
import { IMessage } from "../types/IMessage";
import { NotificationMessage } from "../types/NotificationMessage";
import { RecursiveReadonly } from "../types/RecursiveReadonly";
import { RequestMessage } from "../types/RequestMessage";
import { ResponseError } from "../types/ResponseError";
import { CommandRunner } from "./CommandRunner";
import type { Game } from "./Game";

export abstract class Module<
  S = any,
  M extends Record<string, [any, any]> = {
    [method: string]: [IMessage, IMessage];
  },
  B = any,
  G extends Game = Game
> {
  protected _game: G;

  public get context() {
    return this._game.context as GameContext<B>;
  }

  protected _state: S = {} as S;
  public get state() {
    return this._state as RecursiveReadonly<S>;
  }

  protected _triggerReady: Map<number, () => void> = new Map();

  protected _triggersCreated = 0;

  constructor(game: G) {
    this._game = game;
  }

  abstract getBuiltins(): B;

  abstract getStored(): string[];

  /** Executed when the game is initialized (after it is safe to emit game messages) */
  async onInit(): Promise<void> {}

  /** Executed when the game starts */
  onStart(): void {}

  /** Executed every frame */
  onUpdate(_deltaMS: number): null | boolean {
    return true;
  }

  /** Executed when the game is destroyed */
  onDestroy(): void {}

  /** Restores state from save file */
  async load(state: S) {
    this._state = state;
    this.onLoad();
  }

  /** Executed when a save file is loaded */
  async onLoad() {}

  /** Executed when game has finished instant simulation and should restore from current state */
  async onRestore() {}

  /** Executed when game is reset to its initial state */
  onReset() {}

  /** Executed when game is restarted from its initial state */
  onRestart() {}

  /** Executed before manager state is serialized */
  onSerialize() {}

  /** Executed before game is checkpointed */
  onCheckpoint(_checkpointId: string) {}

  /** Executed when game is previewed at a specific checkpoint location */
  onPreview(_checkpointId: string) {}

  /** Executed when a relevant notification is received */
  onReceiveNotification(_msg: NotificationMessage): void {}

  /** Executed when a relevant request is received */
  async onReceiveRequest(
    _msg: RequestMessage
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
  }

  /** Get next unique trigger id */
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

  /** Allow the event to be triggered */
  protected enableTrigger(triggerId: number, callback: () => void) {
    this._triggerReady.set(triggerId, callback);
  }

  /** Is the event ready to be triggered? */
  isReady(triggerId: number) {
    return Boolean(this._triggerReady.has(triggerId));
  }

  /** Triggers the event (does nothing if the trigger is not yet ready) */
  trigger(triggerId: number) {
    if (this.isReady(triggerId)) {
      const t = this._triggerReady.get(triggerId);
      if (t) {
        t();
      }
      this._triggerReady.delete(triggerId);
    }
  }

  /** Triggers all specified events (does nothing if the triggers are not yet ready) */
  triggerAll(transitionIds: number[]) {
    if (transitionIds.every((id) => this.isReady(id))) {
      transitionIds.forEach((transitionId) => {
        this.trigger(transitionId);
      });
    }
  }

  async emit<K extends keyof M>(
    msg: M[K][0],
    transfer?: ArrayBuffer[]
  ): Promise<M[K][1]> {
    return this._game.connection.emit(
      msg as NotificationMessage | RequestMessage,
      transfer
    ) as Promise<M[K][1]>;
  }
}
