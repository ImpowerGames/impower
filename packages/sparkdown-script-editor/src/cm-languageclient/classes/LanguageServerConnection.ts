import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
} from "vscode-jsonrpc/browser";
import {
  CancellationToken,
  ClientCapabilities,
  CompletionParams,
  CompletionRequest,
  DiagnosticTag,
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  DocumentColorParams,
  DocumentColorRequest,
  FoldingRangeParams,
  FoldingRangeRequest,
  HoverParams,
  HoverRequest,
  InitializeRequest,
  InitializeResult,
  MessageConnection,
  NotificationType,
  PublishDiagnosticsNotification,
  PublishDiagnosticsParams,
  RequestType,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

import {
  DidParseParams,
  DidParseTextDocument,
} from "../types/DidParseTextDocument";
import { LanguageClientOptions } from "../types/LanguageClientOptions";
import ConsoleLogger from "./ConsoleLogger";
import { Event } from "./Event";

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
    // hover: {
    //   dynamicRegistration: true,
    //   contentFormat: ["plaintext", "markdown"],
    // },
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
    // documentSymbol: {
    //   dynamicRegistration: true,
    //   hierarchicalDocumentSymbolSupport: true,
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

export default class LanguageServerConnection {
  protected _options: LanguageClientOptions;

  protected _worker: Worker;

  protected _reader: BrowserMessageReader;

  protected _writer: BrowserMessageWriter;

  protected _connection?: MessageConnection;

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

  protected _publishDiagnosticsEvent = new Event<PublishDiagnosticsParams>();
  get publishDiagnosticsEvent() {
    return this._publishDiagnosticsEvent;
  }

  protected _parseEvent = new Event<DidParseParams>();
  get parseEvent() {
    return this._parseEvent;
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
      initializationOptions: null,
      processId: null,
      workspaceFolders: null,
      rootUri: "file:///",
      ...(clientOptions || {}),
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
    connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
      this._publishDiagnosticsEvent.emit(params);
    });
    connection.onNotification(DidParseTextDocument.type, (params) => {
      this._parseEvent.emit(params);
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

  async stop() {
    this._connection?.dispose();
  }

  protected async sendNotification<P>(
    type: NotificationType<P>,
    params?: P
  ): Promise<void> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendNotification(type, params);
  }

  protected async sendRequest<P, R, E>(
    type: RequestType<P, R, E>,
    params: P,
    token?: CancellationToken
  ): Promise<R> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendRequest(type, params, token);
  }

  notifyDidOpenTextDocument(params: DidOpenTextDocumentParams) {
    return this.sendNotification(DidOpenTextDocumentNotification.type, params);
  }

  notifyDidChangeTextDocument(params: DidChangeTextDocumentParams) {
    return this.sendNotification(
      DidChangeTextDocumentNotification.type,
      params
    );
  }

  async requestDocumentColors(
    params: DocumentColorParams,
    token?: CancellationToken | undefined
  ) {
    return this.sendRequest(DocumentColorRequest.type, params, token);
  }

  async requestFoldingRanges(
    params: FoldingRangeParams,
    token?: CancellationToken | undefined
  ) {
    return this.sendRequest(FoldingRangeRequest.type, params, token);
  }

  async requestHovers(
    params: HoverParams,
    token?: CancellationToken | undefined
  ) {
    return this.sendRequest(HoverRequest.type, params, token);
  }

  async requestCompletions(
    params: CompletionParams,
    token?: CancellationToken | undefined
  ) {
    return this.sendRequest(CompletionRequest.type, params, token);
  }
}
