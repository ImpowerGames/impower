import { DiagnosticTag } from "@impower/spark-editor-protocol/src/enums/DiagnosticTag";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import {
  ClientCapabilities,
  InitializeResult,
  MessageConnection,
  ServerCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { createBrowserMessageConnection } from "@impower/spark-editor-protocol/src/utils/createBrowserMessageConnection";
import ConsoleLogger from "./ConsoleLogger";
import WorkspaceWindow from "./WorkspaceWindow";

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

export default class WorkspaceLanguageServerProtocol {
  protected _window: WorkspaceWindow;

  protected _worker = new Worker("/public/sparkdown-language-server.js");

  protected _name = "Sparkdown Language Server";
  get name() {
    return this._name;
  }

  protected _id = "sparkdown-language-server";
  get id() {
    return this._id;
  }

  protected _connection: MessageConnection;
  get connection() {
    return this._connection;
  }

  protected _serverCapabilities?: ServerCapabilities;
  get serverCapabilities() {
    return this._serverCapabilities;
  }

  protected _starting?: Promise<InitializeResult>;
  get starting() {
    return this._starting;
  }

  constructor(window: WorkspaceWindow) {
    this._window = window;
    this._connection = createBrowserMessageConnection(
      this._worker,
      new ConsoleLogger()
    );
    this._connection.onNotification(
      DidParseTextDocumentMessage.type,
      (params) => {
        this._window.sendNotification(
          DidParseTextDocumentMessage.type.notification(params)
        );
      }
    );
    this._connection.onClose(() => {
      this.stop();
    });
    this._connection.listen();
    this._starting = this.start();
  }

  async start(): Promise<InitializeResult> {
    const result = await this._connection.sendRequest<InitializeResult>(
      InitializeMessage.method,
      {
        capabilities: CLIENT_CAPABILITIES,
      }
    );
    this._serverCapabilities = result.capabilities;
    return result;
  }

  stop() {
    this._connection.dispose();
  }
}
