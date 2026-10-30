import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-jsonrpc/browser";
import type * as lsp from "vscode-languageserver-protocol";

export type Transport = {
  connection?: lsp.MessageConnection;
  send(message: string): void;
  subscribe(handler: (value: string | object) => void): void;
  unsubscribe(handler: (value: string | object) => void): void;
};

export class WorkerTransport implements Transport {
  worker: Worker;

  connection?: lsp.MessageConnection;

  constructor(worker: Worker, connection?: lsp.MessageConnection) {
    this.worker = worker;
    this.connection = connection;
  }

  protected _onMessage?: (_: MessageEvent) => void;

  send(message: string) {
    const json = JSON.parse(message);
    this.worker.postMessage(json);
  }

  subscribe(handler: (value: string | object) => void) {
    this._onMessage = (e: MessageEvent) => {
      handler(e.data);
    };
    this.worker.addEventListener("message", this._onMessage);
  }

  unsubscribe() {
    if (this._onMessage) {
      this.worker.removeEventListener("message", this._onMessage);
    }
  }
}

export class BrowserTransport {
  reader: BrowserMessageReader;

  writer: BrowserMessageWriter;

  connection?: lsp.MessageConnection;

  constructor(
    reader: BrowserMessageReader,
    writer: BrowserMessageWriter,
    connection?: lsp.MessageConnection,
  ) {
    this.reader = reader;
    this.writer = writer;
    this.connection = connection;
  }

  protected _listener?: lsp.Disposable;

  send(message: string) {
    const json = JSON.parse(message);
    this.writer.write(json);
  }

  subscribe(handler: (value: string | object) => void) {
    this._listener = this.reader.listen((data) => {
      handler(data as object);
    });
  }

  unsubscribe() {
    this._listener?.dispose();
  }
}
