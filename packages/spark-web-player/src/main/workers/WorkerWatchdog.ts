import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import {
  WorkerBusyMessage,
  type WorkerBusyParams,
} from "./messages/WorkerBusyMessage";

/**
 * How long the player's worker may run stories without yielding before the
 * page takes it for a script that never yields and restarts it (#679).
 *
 * Only story execution counts: the worker reports it (`WorkerBusyMessage`),
 * and a compile, which runs no story, reports nothing however long it takes.
 * The longest legitimate stretch is a route search or replay on a large
 * project; this is set well above the longest measured on the Raffles & Bunny
 * project (see the PR for #679), and under the eight seconds the engine's own
 * step ceiling takes to stop a loop that does nothing but loop.
 */
export const WORKER_HANG_AFTER_MS = 3_000;

/**
 * The page's watch on the player's worker: it hears how long the worker has
 * been running stories without yielding and calls `onHang` once, the first
 * time that reaches `hangAfterMs`.
 */
export class WorkerWatchdog {
  protected _fired = false;

  constructor(
    protected _connection: MessageConnection,
    protected _onHang: (params: WorkerBusyParams) => void,
    protected _hangAfterMs = WORKER_HANG_AFTER_MS,
  ) {
    _connection.addEventListener("message", this.onMessage);
  }

  protected onMessage = (e: MessageEvent) => {
    const message = e.data;
    if (this._fired || !WorkerBusyMessage.type.isNotification(message)) {
      return;
    }
    if (message.params.busyMs >= this._hangAfterMs) {
      this._fired = true;
      this._onHang(message.params);
    }
  };

  dispose() {
    this._fired = true;
    this._connection.removeEventListener("message", this.onMessage);
  }
}
