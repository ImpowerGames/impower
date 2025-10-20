import { IMessage } from "@impower/jsonrpc/src/types/IMessage";
import { NotificationMessage } from "@impower/jsonrpc/src/types/NotificationMessage";
import { RequestMessage } from "@impower/jsonrpc/src/types/RequestMessage";
import { ResponseError } from "@impower/jsonrpc/src/types/ResponseError";
import { GameContext } from "../types/GameContext";
import { RecursiveReadonly } from "../types/RecursiveReadonly";
import { Clock } from "./Clock";
import type { Game } from "./Game";

export abstract class Module<
  S = any,
  _M extends Record<string, [any, any]> = {
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

  protected _triggerReady: Map<number, boolean | (() => void)> = new Map();

  protected _triggersCreated = 0;

  constructor(game: G) {
    this._game = game;
  }

  abstract getBuiltins(): B;

  abstract getStored(): string[];

  /** Executed when the game is initialized */
  onInit() {}

  /** Executed when the game is ready to send messages */
  onConnected() {}

  /** Executed when the game starts */
  onStart(): void {}

  /** Executed every frame */
  onUpdate(_time: Clock): null | boolean {
    return true;
  }

  /** Executed when the game is destroyed */
  onDestroy(): void {}

  /** Resets module state */
  async reset() {
    this._state = {} as S;
    this.onReset();
  }

  /** Restores state from save file */
  async load(state: S) {
    this._state = state;
    this.onLoad();
  }

  onReset() {}

  /** Executed when a save file is loaded */
  async onLoad() {}

  /** Executed when game has finished instant simulation and should restore from current state */
  async onRestore() {}

  /** Executed when game is restarted from its initial state */
  onRestart() {}

  /** Executed before state is serialized */
  onSerialize() {}

  /** Executed when game is previewed at a specific checkpoint location */
  onPreview() {}

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
  protected enableTrigger(triggerId: number, callback?: () => void) {
    this._triggerReady.set(triggerId, callback ?? true);
  }

  /** Is the event ready to be triggered? */
  isReady(triggerId: number) {
    return Boolean(this._triggerReady.has(triggerId));
  }

  /** Triggers the event (does nothing if the trigger is not yet ready) */
  trigger(triggerId: number) {
    if (this.isReady(triggerId)) {
      const t = this._triggerReady.get(triggerId);
      if (t && typeof t === "function") {
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

  async emit<M extends string, P, R>(
    msg: RequestMessage<M, P, R> | NotificationMessage<M, P>,
    transfer?: ArrayBuffer[]
  ): Promise<R> {
    return this._game.connection.emit(msg, transfer);
  }
}
