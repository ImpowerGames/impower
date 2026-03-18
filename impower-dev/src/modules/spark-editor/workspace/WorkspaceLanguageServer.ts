import { DiagnosticTag } from "@impower/spark-editor-protocol/src/enums/DiagnosticTag";
import {
  InitializeMessage,
  InitializeParams,
  InitializeResult,
} from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { InitializedMessage } from "@impower/spark-editor-protocol/src/protocols/InitializedMessage";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import {
  ClientCapabilities,
  ConfigurationParams,
  DiagnosticClientCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { DEFAULT_BUILTIN_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTIN_DEFINITIONS";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import {
  CompiledProgramMessage,
  CompiledProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  MessageConnection,
} from "vscode-jsonrpc/browser";
import type { SparkProgram } from "../../../../../packages/sparkdown/src/compiler/types/SparkProgram";
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
    workspaceEdit: {
      failureHandling: "abort",
    },
  },
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
        commitCharactersSupport: true,
        documentationFormat: ["plaintext", "markdown"],
        // deprecatedSupport: true,
        // preselectSupport: true,
        // tagSupport: { valueSet: [] },
        // insertReplaceSupport: true,
        // resolveSupport: { properties: ["documentation", "detail"] },
        // insertTextModeSupport: { valueSet: [] },
        labelDetailsSupport: true,
      },
      completionItemKind: { valueSet: [] },
      // insertTextMode: InsertTextMode.asIs,
      contextSupport: true,
      completionList: {
        itemDefaults: ["commitCharacters", "editRange", "insertTextFormat"],
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
    formatting: {
      dynamicRegistration: true,
    },
    rename: {
      dynamicRegistration: true,
    },
    signatureHelp: {
      dynamicRegistration: true,
      contextSupport: true,
      signatureInformation: {
        documentationFormat: ["plaintext", "markdown"],
        parameterInformation: {
          labelOffsetSupport: true,
        },
        activeParameterSupport: true,
      },
    },
    definition: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    declaration: {
      dynamicRegistration: true,
      linkSupport: false,
    },
    implementation: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    typeDefinition: {
      dynamicRegistration: true,
      linkSupport: true,
    },
    references: {
      dynamicRegistration: true,
    },
    diagnostic: {
      dynamicRegistration: true,
      markupMessageSupport: true,
    } as DiagnosticClientCapabilities,
    publishDiagnostics: {
      relatedInformation: true,
      tagSupport: {
        valueSet: [DiagnosticTag.Unnecessary, DiagnosticTag.Deprecated],
      },
    },
    colorProvider: {
      dynamicRegistration: true,
    },
    foldingRange: {
      dynamicRegistration: true,
    },
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
    // rangeFormatting: {},
    // onTypeFormatting: {},
    // selectionRange: {},
    // moniker: {},
  },
};

export type LanguageServerEvents = {
  "compiler/didCompile": (params: CompiledProgramParams) => void;
};

export default class WorkspaceLanguageServer {
  protected _worker: Worker;
  get worker() {
    return this._worker;
  }

  protected _reader: BrowserMessageReader;
  get reader() {
    return this._reader;
  }

  protected _writer: BrowserMessageWriter;
  get writer() {
    return this._writer;
  }

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

  protected _events: {
    [K in keyof LanguageServerEvents]: Set<LanguageServerEvents[K]>;
  } = {
    "compiler/didCompile": new Set(),
  };

  protected _program?: SparkProgram;

  protected _initializeParams?: InitializeParams;
  get initializeParams() {
    return this._initializeParams;
  }

  protected _initializeResult?: InitializeResult;
  get initializeResult() {
    return this._initializeResult;
  }

  protected _onInitialized: ((result: InitializeResult) => void)[] = [];

  constructor() {
    this._worker = new Worker("/sparkdown-language-server.js");
    this._worker.onerror = (e) => {
      console.error(e);
    };
    this._reader = new BrowserMessageReader(this._worker);
    this._writer = new BrowserMessageWriter(this._worker);
    this._connection = createMessageConnection(
      this._reader,
      this._writer,
      new ConsoleLogger(),
    );
    this._connection.onRequest(
      "workspace/textDocumentContent/refresh",
      (params: { uri: string }) => {
        return null;
      },
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
      },
    );
    this._connection.onNotification(
      CompiledProgramMessage.method,
      (params: CompiledProgramParams) => {
        performance.mark(`CompiledProgramMessage start`);
        this.updateProgram(params.program);
        this._events[CompiledProgramMessage.method].forEach((l) => {
          l?.(params);
        });
        this.emit(
          MessageProtocol.event,
          CompiledProgramMessage.type.notification(params),
        );
        performance.mark(`CompiledProgramMessage end`);
        performance.measure(
          `CompiledProgramMessage`,
          `CompiledProgramMessage start`,
          `CompiledProgramMessage end`,
        );
      },
    );
    this._connection.onClose(() => {
      this.stop();
    });
    this._connection.listen();
  }

  async start(
    projectPath: string,
    files: { uri: string }[],
  ): Promise<InitializeResult> {
    const uri = Workspace.window.getOpenedDocumentUri();
    this._initializeParams = {
      rootUri: projectPath,
      processId: null,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: {
        settings: Workspace.configuration.settings,
        files,
        definitions: {
          builtins: DEFAULT_BUILTIN_DEFINITIONS,
          optionals: DEFAULT_OPTIONAL_DEFINITIONS,
          schemas: DEFAULT_SCHEMA_DEFINITIONS,
          descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
        },
        uri,
      },
      workspaceFolders: [
        {
          uri: projectPath,
          name: "Project",
        },
      ],
    };
    const result = await this._connection.sendRequest<InitializeResult>(
      InitializeMessage.method,
      this._initializeParams,
    );
    this._initializeResult = result;
    this.updateProgram(result["program"]);
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

  async getInitializeParams(): Promise<InitializeParams> {
    await this.initialization();
    if (!this._initializeParams) {
      throw new Error("Language server not initialized.");
    }
    return this._initializeParams;
  }

  async getInitializeResult(): Promise<InitializeResult> {
    await this.initialization();
    if (!this._initializeResult) {
      throw new Error("Language server not initialized.");
    }
    return this._initializeResult;
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

  updateProgram(program: SparkProgram | undefined) {
    this._program = program;
  }

  addEventListener<K extends keyof LanguageServerEvents>(
    event: K,
    listener: LanguageServerEvents[K],
  ) {
    this._events[event].add(listener);
  }

  removeEventListener<K extends keyof LanguageServerEvents>(
    event: K,
    listener: LanguageServerEvents[K],
  ) {
    this._events[event].delete(listener);
  }

  protected emit<T>(eventName: string, detail?: T): boolean {
    return window.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      }),
    );
  }
}
