import {
  MessageConnection,
  MessageConnectionEvents,
} from "./MessageConnection";

export class WorkerMessageConnection extends MessageConnection {
  protected _worker: Worker;

  constructor(worker: Worker) {
    super((message, transfer) => worker.postMessage(message, { transfer }));
    this._worker = worker;
  }

  override addEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    this._worker.addEventListener(event, listener);
  }

  override removeEventListener<K extends keyof MessageConnectionEvents>(
    event: K,
    listener: MessageConnectionEvents[K]
  ) {
    this._worker.removeEventListener(event, listener);
  }
}
