import type { MessageConnection } from "@impower/jsonrpc/src/browser/classes/MessageConnection";
import {
  WorkerBusyMessage,
  type WorkerBusyParams,
} from "./messages/WorkerBusyMessage";

export const WORKER_HANG_AFTER_MS = 3_000;

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
