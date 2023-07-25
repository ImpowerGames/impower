import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
} from "vscode-jsonrpc/browser";
import {
  ClientCapabilities,
  DiagnosticTag,
  Disposable,
  InitializeRequest,
  InitializeResult,
  MessageConnection,
  NotificationHandler,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

import ConsoleLogger from "./ConsoleLogger";
import { LanguageClientOptions } from "./LanguageClientOptions";

const CLIENT_CAPABILITIES: ClientCapabilities = {
  workspace: {
    didChangeConfiguration: {
      dynamicRegistration: true,
    },
    didChangeWatchedFiles: {
      dynamicRegistration: false,
    },
  },
  textDocument: {
    synchronization: {
      dynamicRegistration: true,
      willSave: true,
      willSaveWaitUntil: true,
      didSave: true,
    },
    colorProvider: { dynamicRegistration: true },
    foldingRange: {
      dynamicRegistration: true,
    },
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: {
        valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
      },
    },
    completion: {
      dynamicRegistration: true,
      contextSupport: true,
      completionItem: {
        documentationFormat: ["plaintext", "markdown"],
        // snippetSupport: true,
        // insertReplaceSupport: true,
        // commitCharactersSupport: true,
        // deprecatedSupport: true,
        // preselectSupport: true,
        // resolveSupport: { properties: ["documentation", "detail"] },
      },
    },
    hover: {
      dynamicRegistration: true,
      contentFormat: ["plaintext", "markdown"],
    },
    documentSymbol: {
      dynamicRegistration: true,
      hierarchicalDocumentSymbolSupport: true,
    },
    // signatureHelp: {
    //   dynamicRegistration: true,
    //   signatureInformation: {
    //     documentationFormat: ["plaintext", "markdown"],
    //     parameterInformation: {
    //       labelOffsetSupport: true,
    //     },
    //     activeParameterSupport: true,
    //   },
    //   contextSupport: true,
    // },
    // declaration: {
    //   dynamicRegistration: true,
    //   linkSupport: false,
    // },
    // definition: {
    //   dynamicRegistration: true,
    //   linkSupport: true,
    // },
    // typeDefinition: {
    //   dynamicRegistration: true,
    //   linkSupport: true,
    // },
    // implementation: {
    //   dynamicRegistration: true,
    //   linkSupport: true,
    // },
    // references: {
    //   dynamicRegistration: true,
    // },
    // documentHighlight: {
    //   dynamicRegistration: true,
    // },
    // codeAction: {
    //   dynamicRegistration: true,
    //   dataSupport: true,
    //   codeActionLiteralSupport: {
    //     codeActionKind: {
    //       valueSet: [CodeActionKind.Source],
    //     },
    //   },
    // },
    // codeLens: {},
    // documentLink: {
    //   dynamicRegistration: true,
    //   tooltipSupport: false,
    // },
    // formatting: {},
    // rangeFormatting: {},
    // onTypeFormatting: {},
    // rename: {},
    // selectionRange: {},
    // moniker: {},
  },
};

export default class SparkdownLanguageServerConnection {
  protected _options: LanguageClientOptions;

  protected _worker: Worker;

  protected _reader: BrowserMessageReader;

  protected _writer: BrowserMessageWriter;

  protected _connection?: MessageConnection;
  get connection() {
    return this._connection;
  }

  protected _name: string;
  get name() {
    return this._name;
  }

  protected _id: string;
  get id() {
    return this._id;
  }

  protected _serverCapabilities?: ServerCapabilities;
  get serverCapabilities() {
    return this._serverCapabilities;
  }

  protected _starting?: Promise<InitializeResult>;
  get starting() {
    return this._starting;
  }

  constructor(
    id: string,
    name: string,
    clientOptions: LanguageClientOptions,
    worker: Worker
  ) {
    this._id = id;
    this._name = name;
    this._options = {
      capabilities: CLIENT_CAPABILITIES,
      ...(clientOptions || {}),
      initializationOptions: {
        ...(clientOptions?.initializationOptions || {}),
      },
    };
    this._worker = worker;
    this._reader = new BrowserMessageReader(this._worker);
    this._writer = new BrowserMessageWriter(this._worker);
    this._starting = this.start();
  }

  async start(): Promise<InitializeResult> {
    const connection = createMessageConnection(
      this._reader,
      this._writer,
      new ConsoleLogger()
    );
    connection.onClose(() => {
      this.stop();
    });
    connection.listen();
    const result = await connection.sendRequest<InitializeResult>(
      InitializeRequest.method,
      this._options
    );
    this._connection = connection;
    this._serverCapabilities = result.capabilities;
    return result;
  }

  stop() {
    this._connection?.dispose();
  }

  onNotification<P>(
    method: string,
    handler: NotificationHandler<P>
  ): Disposable {
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.onNotification(method, handler);
  }

  async sendNotification<P>(method: string, params?: P): Promise<void> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendNotification(method, params);
  }

  async sendRequest<P, R>(method: string, params: P): Promise<R> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendRequest(method, params);
  }
}
