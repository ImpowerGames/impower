import { DiagnosticTag } from "@impower/spark-editor-protocol/src/enums/DiagnosticTag";
import { InitializeMessage } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { InitializedMessage } from "@impower/spark-editor-protocol/src/protocols/InitializedMessage";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import {
  ClientCapabilities,
  ConfigurationParams,
  InitializeResult,
  MessageConnection,
  ServerCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { createBrowserMessageConnection } from "@impower/spark-editor-protocol/src/utils/createBrowserMessageConnection";
import type { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import ConsoleLogger from "./ConsoleLogger";
import { Workspace } from "./Workspace";

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

export default class WorkspaceLanguageServer {
  protected _worker = new Worker("/sparkdown-language-server.js");

  protected _name = "Sparkdown Language Server";
  get name() {
    return this._name;
  }

  protected _id = "sparkdown-language-server";
  get id() {
    return this._id;
  }

  protected _connection: MessageConnection;

  protected _serverCapabilities?: ServerCapabilities;

  protected _program?: SparkProgram;

  protected _initializeResult?: InitializeResult;

  protected _onInitialized: ((result: InitializeResult) => void)[] = [];

  constructor() {
    this._connection = createBrowserMessageConnection(
      this._worker,
      new ConsoleLogger()
    );
    this._connection.onRequest(
      ConfigurationMessage.method,
      (params: ConfigurationParams) => {
        const result = params.items.map((item) => {
          if (item.section === "sparkdown") {
            return Workspace.configuration.settings;
          }
          return {};
        });
        return result;
      }
    );
    this._connection.onNotification(
      DidParseTextDocumentMessage.type,
      (params) => {
        this._program = params.program;
        this.emit(
          DidParseTextDocumentMessage.method,
          DidParseTextDocumentMessage.type.notification(params)
        );
      }
    );
    this._connection.onClose(() => {
      this.stop();
    });
    this._connection.listen();
  }

  async start(
    projectPath: string,
    files: Record<
      string,
      {
        uri: string;
        name: string;
        src: string;
        ext: string;
        type: string;
        text?: string;
      }
    >
  ): Promise<InitializeResult> {
    const result = await this._connection.sendRequest<InitializeResult>(
      InitializeMessage.method,
      {
        capabilities: CLIENT_CAPABILITIES,
        initializationOptions: {
          settings: Workspace.configuration.settings,
          files,
        },
        workspaceFolders: [
          {
            uri: projectPath,
            name: "Project",
          },
        ],
      }
    );
    this._serverCapabilities = result.capabilities;
    this._program = result?.["program"] || {};
    this._connection.sendNotification(InitializedMessage.method, {});
    this._onInitialized.forEach((callback) => {
      callback?.(result);
    });
    this._onInitialized = [];
    this._initializeResult = result;
    return result;
  }

  async initialization() {
    if (!this._initializeResult) {
      await new Promise<InitializeResult>((resolve) => {
        this._onInitialized.push(resolve);
      });
    }
    return this._initializeResult;
  }

  async getConnection(): Promise<MessageConnection> {
    await this.initialization();
    if (!this._connection) {
      throw new Error("Language server not initialized.");
    }
    return this._connection;
  }

  async getServerCapabilities(): Promise<ServerCapabilities> {
    await this.initialization();
    if (!this._serverCapabilities) {
      throw new Error("Language server not initialized.");
    }
    return this._serverCapabilities;
  }

  async getProgram() {
    await this.initialization();
    if (!this._program) {
      throw new Error("Language server not initialized.");
    }
    return this._program;
  }

  stop() {
    this._connection.dispose();
  }

  protected emit<T>(eventName: string, detail?: T): boolean {
    return window.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      })
    );
  }
}
