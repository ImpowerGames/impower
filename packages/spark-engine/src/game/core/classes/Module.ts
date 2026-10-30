import type { IMessage } from "@impower/jsonrpc/src/common/types/IMessage";
import type { NotificationMessage } from "@impower/jsonrpc/src/common/types/NotificationMessage";
import type { RequestMessage } from "@impower/jsonrpc/src/common/types/RequestMessage";
import type { ResponseError } from "@impower/jsonrpc/src/common/types/ResponseError";
import type { GameContext } from "../types/GameContext";
import type { RecursiveReadonly } from "../types/RecursiveReadonly";
import { Clock } from "./Clock";
import { DISCONNECTED, SUPERSEDED } from "./Connection";
import type { Game } from "./Game";

export abstract class Module<
  S = any,
  _M extends Record<string, [any, any]> = {
    [method: string]: [IMessage, IMessage];
  },
  B = any,
  G extends Game = Game,
> {
  protected _game: G;

  public get context() {
    return this._game.context as GameContext<B>;
  }

  protected _state: S = {} as S;
  public get state() {
    return this._state as RecursiveReadonly<S>;
  }

  protected _triggerReady: Map<number, boolean | ((time?: number) => void)> =
    new Map();

  protected _triggersCreated = 0;

  constructor(game: G) {
    this._game = game;
  }

  abstract getBuiltins(): B;

  abstract getStored(): string[];

  onInit() {}

  onProgramUpdate() {}

  async onConnected() {}

  onStart(): void {}

  onUpdate(_time: Clock): null | boolean {
    return true;
  }

  onDestroy(): void {}

  async reset() {
    this._state = {} as S;
    this.onReset();
  }

  async load(state: S) {
    this._state = state;
    this.onLoad();
  }

  onReset() {}

  async onLoad() {}

  async onRestore() {}

  onRestart() {}

  onPreview() {}

  onReplay() {}
  onReplayEnd() {}

  onEnterScene(_scene: string, _previous: string | null, _stack: string[]) {}

  onReceiveNotification(_msg: NotificationMessage): void {}

  async onReceiveRequest(
    _msg: RequestMessage,
  ): Promise<
    | { error: ResponseError; transfer?: ArrayBuffer[] }
    | { result: unknown; transfer?: ArrayBuffer[] }
    | undefined
  > {
    return undefined;
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

  protected enableTrigger(
    triggerId: number,
    callback?: (time?: number) => void,
  ) {
    this._triggerReady.set(triggerId, callback ?? true);
  }

  isReady(triggerId: number) {
    return Boolean(this._triggerReady.has(triggerId));
  }

  trigger(triggerId: number, time?: number) {
    if (this.isReady(triggerId)) {
      const t = this._triggerReady.get(triggerId);
      if (t && typeof t === "function") {
        t(time);
      }
      this._triggerReady.delete(triggerId);
    }
  }

  triggerAll(transitionIds: number[], time?: number) {
    if (transitionIds.every((id) => this.isReady(id))) {
      transitionIds.forEach((transitionId) => {
        this.trigger(transitionId, time);
      });
    }
  }

  async emit<M extends string, P, R>(
    msg: RequestMessage<M, P, R> | NotificationMessage<M, P>,
    transfer?: ArrayBuffer[],
  ): Promise<R> {
    return this._game.connection.emit(msg, transfer);
  }

  superseded(epoch: number): boolean {
    return this._game.connection.epoch !== epoch;
  }

  async emitSettled<M extends string, P, R>(
    msg: RequestMessage<M, P, R>,
    transfer?: ArrayBuffer[],
  ): Promise<R | undefined> {
    return this.settled(msg.method, this._game.connection.emit(msg, transfer));
  }

  protected async settled<R>(
    method: string,
    answer: Promise<R>,
  ): Promise<R | undefined> {
    try {
      return await answer;
    } catch (e) {
      const code = (e as ResponseError | undefined)?.code;
      if (code !== DISCONNECTED && code !== SUPERSEDED) {
        console.warn(
          `spark-engine: ${method} failed: ${(e as ResponseError | undefined)?.message ?? e}`,
        );
      }
      return undefined;
    }
  }
}
