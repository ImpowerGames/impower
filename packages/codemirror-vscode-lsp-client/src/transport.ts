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
  /// Register a handler for messages coming from the server. Transports
  /// that already hold the message as a parsed object (e.g. a Worker's
  /// structured-clone `e.data`) may pass the object through directly —
  /// re-serializing it to a string just so the client can JSON.parse it
  /// again costs real main-thread time on large payloads (whole-document
  /// semantic tokens / diagnostics on big files).
  subscribe(handler: (value: string | object) => void): void;
  /// Unregister a handler registered with `subscribe`.
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
      // Pass the structured-clone object straight through — stringifying
      // here (for the client to immediately re-parse) doubled the
      // main-thread cost of every server response.
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
      // Reader already delivers a parsed message object — pass it through
      // (see WorkerTransport.subscribe).
      handler(data as object);
    });
  }

  unsubscribe() {
    this._listener?.dispose();
  }
}
