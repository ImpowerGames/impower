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

  protected _triggerReady: Map<number, boolean | (() => void)> = new Map();

  protected _triggersCreated = 0;

  constructor(game: G) {
    this._game = game;
  }

  abstract getBuiltins(): B;

  abstract getStored(): string[];

  /** Executed when the game is initialized */
  onInit() {}

  /** Executed when the program is reloaded in place (live edit → recompile):
   *  the context channels have been re-assigned from the new program, so a
   *  module should re-derive any state it cached from `context` here. */
  onProgramUpdate() {}

  /** Executed when the game is ready to send messages */
  async onConnected() {}

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

  /** Executed when game is previewed at a specific checkpoint location */
  onPreview() {}

  /** Executed before and after a route replay. The replay changes the state a
   *  checkpoint saves, as any run does, and presents nothing on the page, so
   *  a module that records what the page is presenting leaves that record as
   *  the replay found it. */
  onReplay() {}
  onReplayEnd() {}

  /** Executed when the story enters a different scene (a top-level flow that
   *  is not a function): on a path change while running, at connect, at
   *  start, and at preview. Never during a route simulation. `stack` names the
   *  flows the story will return to (the callers of open tunnels and threads). */
  onEnterScene(_scene: string, _previous: string | null, _stack: string[]) {}

  /** Executed when a relevant notification is received */
  onReceiveNotification(_msg: NotificationMessage): void {}

  /** Executed when a relevant request is received */
  async onReceiveRequest(
    _msg: RequestMessage,
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
    transfer?: ArrayBuffer[],
  ): Promise<R> {
    return this._game.connection.emit(msg, transfer);
  }

  /**
   * Whether a newer connect has begun since `epoch` was read. Work a connect
   * started and resumes after an await checks this first: what it would send
   * next belongs to a stream the page has moved past, and the page would
   * take it as part of the newer one.
   */
  superseded(epoch: number): boolean {
    return this._game.connection.epoch !== epoch;
  }

  /**
   * Send a request and wait until the page is done with it, whatever its
   * answer. The page answers every request, with an error when it could not
   * act on it: it went away, the request's stream was superseded, or nothing
   * on the page handles the method. None of those leaves anything to wait
   * for, so the wait ends with `undefined` instead of a rejection nobody
   * catches. The first two are the page letting go; the last is a page that
   * does not match this engine, and is reported.
   */
  async emitSettled<M extends string, P, R>(
    msg: RequestMessage<M, P, R>,
    transfer?: ArrayBuffer[],
  ): Promise<R | undefined> {
    try {
      return await this._game.connection.emit(msg, transfer);
    } catch (e) {
      const code = (e as ResponseError | undefined)?.code;
      if (code !== DISCONNECTED && code !== SUPERSEDED) {
        console.warn(
          `spark-engine: ${msg.method} failed: ${(e as ResponseError | undefined)?.message ?? e}`,
        );
      }
      return undefined;
    }
  }
}
