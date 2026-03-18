import {
  BrowserMessageReader,
  BrowserMessageWriter,
} from "vscode-jsonrpc/browser";
import type * as lsp from "vscode-languageserver-protocol";

/// An object of this type should be used to wrap whatever transport
/// layer you use to talk to your language server. Messages should
/// contain only the JSON messages, no LSP headers.
export type Transport = {
  connection?: lsp.MessageConnection;
  /// Send a message to the server. Should throw if the connection is
  /// broken somehow.
  send(message: string): void;
  /// Register a handler for messages coming from the server.
  subscribe(handler: (value: string) => void): void;
  /// Unregister a handler registered with `subscribe`.
  unsubscribe(handler: (value: string) => void): void;
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

  subscribe(handler: (value: string) => void) {
    this._onMessage = (e: MessageEvent) => {
      handler(JSON.stringify(e.data));
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

  subscribe(handler: (value: string) => void) {
    this._listener = this.reader.listen((data) => {
      handler(JSON.stringify(data));
    });
  }

  unsubscribe() {
    this._listener?.dispose();
  }
}
