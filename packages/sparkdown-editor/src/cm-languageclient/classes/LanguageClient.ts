import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
} from "vscode-jsonrpc/browser";
import {
  ClientCapabilities,
  DiagnosticTag,
  InitializeRequest,
  MessageConnection,
  ParameterStructures,
} from "vscode-languageserver-protocol";

import { LanguageClientOptions } from "../types/LanguageClientOptions";
import ConsoleLogger from "./ConsoleLogger";

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
        commitCharactersSupport: false,
        documentationFormat: ["markdown", "plaintext"],
        deprecatedSupport: true,
        preselectSupport: true,
        resolveSupport: { properties: ["documentation", "detail"] },
      },
      contextSupport: true,
    },
    hover: {
      dynamicRegistration: true,
      contentFormat: ["markdown", "plaintext"],
    },
    signatureHelp: {
      dynamicRegistration: true,
      signatureInformation: {
        documentationFormat: ["markdown", "plaintext"],
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
    // codeAction: {},
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
  protected _id: string;

  protected _name: string;

  protected _options: LanguageClientOptions;

  protected _worker: Worker;

  protected _connection: MessageConnection;

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
    const reader = new BrowserMessageReader(this._worker);
    const writer = new BrowserMessageWriter(this._worker);
    this._connection = createMessageConnection(
      reader,
      writer,
      new ConsoleLogger()
    );
    this._connection.onClose(() => {
      this.stop();
    });
    this._connection.listen();
  }

  async start() {
    const result = await this.sendRequest(
      InitializeRequest.method,
      this._options
    );
    console.log(this._id, result);
  }

  async stop() {
    this._connection.dispose();
  }

  public async sendNotification(
    type: string,
    r0?: any,
    ...rest: any[]
  ): Promise<void> {
    return this._connection.sendNotification(type, r0, ...rest);
  }

  public async sendRequest<R>(
    type: string,
    r0?: ParameterStructures | any,
    ...rest: any[]
  ): Promise<R> {
    return this._connection.sendRequest<R>(type, r0, ...rest);
  }
}
