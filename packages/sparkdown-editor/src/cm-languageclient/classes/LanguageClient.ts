import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
} from "vscode-jsonrpc/browser";
import {
  ClientCapabilities,
  CodeActionKind,
  CompletionParams,
  CompletionRequest,
  DiagnosticTag,
  DidChangeTextDocumentNotification,
  DidChangeTextDocumentParams,
  DidOpenTextDocumentNotification,
  DidOpenTextDocumentParams,
  HoverParams,
  HoverRequest,
  InitializeRequest,
  InitializeResult,
  MessageConnection,
  ParameterStructures,
  ServerCapabilities,
} from "vscode-languageserver-protocol";

import { LanguageClientOptions } from "../types/LanguageClientOptions";
import ConsoleLogger from "./ConsoleLogger";
import type LanguageClientPlugin from "./LanguageClientPlugin";

const CLIENT_CAPABILITIES: ClientCapabilities = {
  textDocument: {
    synchronization: {
      dynamicRegistration: true,
      willSave: true,
      willSaveWaitUntil: true,
      didSave: true,
    },
    completion: {
      dynamicRegistration: true,
      completionItem: {
        snippetSupport: true,
        insertReplaceSupport: true,
        commitCharactersSupport: true,
        documentationFormat: ["plaintext", "markdown"],
        deprecatedSupport: true,
        preselectSupport: true,
        resolveSupport: { properties: ["documentation", "detail"] },
      },
      contextSupport: true,
    },
    hover: {
      dynamicRegistration: true,
      contentFormat: ["plaintext", "markdown"],
    },
    signatureHelp: {
      dynamicRegistration: true,
      signatureInformation: {
        documentationFormat: ["plaintext", "markdown"],
        parameterInformation: {
          labelOffsetSupport: true,
        },
        // activeParameterSupport: true,
      },
      contextSupport: true,
    },
    declaration: {
      dynamicRegistration: true,
      linkSupport: false,
    },
    definition: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    typeDefinition: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    implementation: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    references: {
      dynamicRegistration: true,
    },
    documentHighlight: {
      dynamicRegistration: true,
    },
    documentSymbol: {
      dynamicRegistration: true,
      hierarchicalDocumentSymbolSupport: true,
    },
    codeAction: {
      dynamicRegistration: true,
      dataSupport: true,
      codeActionLiteralSupport: {
        codeActionKind: {
          valueSet: [CodeActionKind.Source],
        },
      },
    },
    // codeLens: {},
    // documentLink: {
    //   dynamicRegistration: true,
    //   tooltipSupport: false,
    // },
    // colorProvider: {},
    // formatting: {},
    // rangeFormatting: {},
    // onTypeFormatting: {},
    // rename: {},
    // foldingRange: {},
    // selectionRange: {},
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: {
        valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
      },
    },
    moniker: {},
  },
  workspace: {
    didChangeConfiguration: {
      dynamicRegistration: true,
    },
    didChangeWatchedFiles: {
      dynamicRegistration: false,
    },
  },
};

export default class LanguageClient {
  protected _plugins = new Set<LanguageClientPlugin>();

  protected _id: string;

  protected _name: string;

  protected _options: LanguageClientOptions;

  protected _worker: Worker;

  protected _reader: BrowserMessageReader;

  protected _writer: BrowserMessageWriter;

  protected _connection?: MessageConnection;

  protected _capabilities?: ServerCapabilities;

  protected _starting?: Promise<InitializeResult>;

  get id() {
    return this._id;
  }

  get starting() {
    return this._starting;
  }

  get capabilities() {
    return this._capabilities;
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
    connection.onNotification((method, params) => {
      this._plugins.forEach((plugin) => {
        plugin.handleNotification(method, params);
      });
    });
    connection.listen();
    const result = await connection.sendRequest<InitializeResult>(
      InitializeRequest.method,
      this._options
    );
    this._connection = connection;
    this._capabilities = result.capabilities;
    return result;
  }

  async stop() {
    this._connection?.dispose();
  }

  protected async sendNotification(
    type: string,
    r0?: any,
    ...rest: any[]
  ): Promise<void> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendNotification(type, r0, ...rest);
  }

  protected async sendRequest<R>(
    type: string,
    r0?: ParameterStructures | any,
    ...rest: any[]
  ): Promise<R> {
    if (this._starting) {
      await this._starting;
    }
    if (!this._connection) {
      throw new Error("Connection could not be established");
    }
    return this._connection.sendRequest<R>(type, r0, ...rest);
  }

  attachPlugin(plugin: LanguageClientPlugin) {
    this._plugins.add(plugin);
  }

  detachPlugin(plugin: LanguageClientPlugin) {
    this._plugins.delete(plugin);
  }

  textDocumentDidOpen(params: DidOpenTextDocumentParams) {
    return this.sendNotification(
      DidOpenTextDocumentNotification.method,
      params
    );
  }

  textDocumentDidChange(params: DidChangeTextDocumentParams) {
    return this.sendNotification(
      DidChangeTextDocumentNotification.method,
      params
    );
  }

  async textDocumentHover(params: HoverParams) {
    return this.sendRequest(HoverRequest.method, params);
  }

  async textDocumentCompletion(params: CompletionParams) {
    return this.sendRequest(CompletionRequest.method, params);
  }
}
