import type { SparkDiagnostic } from "@impower/sparkdown/src/compiler/types/SparkDiagnostic";
import type {
  DocumentDiagnosticReport,
  DocumentSymbol,
} from "vscode-languageserver-protocol";
import { DiagnosticTag } from "@impower/spark-editor-protocol/src/enums/DiagnosticTag";
import {
  InitializeMessage,
  InitializeParams,
  InitializeResult,
} from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import { InitializedMessage } from "@impower/spark-editor-protocol/src/protocols/InitializedMessage";
import type { WorkspaceEdit } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import {
  FindTextMessage,
  type FindTextParams,
  type FindTextResult,
} from "@impower/spark-editor-protocol/src/protocols/workspace/FindTextMessage";
import type {
  Location,
  LocationLink,
  Position,
  Range,
} from "vscode-languageserver-protocol";
import { sendProtocolMessage } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  PreviewLineMessage,
  type PreviewLineParams,
  type PreviewLineResult,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PreviewLineMessage";
import {
  PublishDiagnosticsMessage,
  type PublishDiagnosticsParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/PublishDiagnosticsMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import {
  ClientCapabilities,
  ConfigurationParams,
  DiagnosticClientCapabilities,
} from "@impower/spark-editor-protocol/src/types";
import { DEFAULT_DESCRIPTION_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_DESCRIPTION_DEFINITIONS";
import { DEFAULT_OPTIONAL_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_OPTIONAL_DEFINITIONS";
import { DEFAULT_SCHEMA_DEFINITIONS } from "@impower/spark-engine/src/game/modules/DEFAULT_SCHEMA_DEFINITIONS";
import {
  CompiledProgramMessage,
  CompiledProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import { profilePhase } from "@impower/sparkdown/src/compiler/utils/profile";
import {
  BrowserMessageReader,
  BrowserMessageWriter,
  createMessageConnection,
  MessageConnection,
} from "vscode-jsonrpc/browser";
import type { SparkProgram } from "../../../../../packages/sparkdown/src/compiler/types/SparkProgram";
import ConsoleLogger from "./ConsoleLogger";
import type { AssetUseRole } from "./assetUsage";
import problems from "./problems/ProblemsStore";
import type WorkspaceConfiguration from "./WorkspaceConfiguration";
import type WorkspaceWindow from "./WorkspaceWindow";
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
        labelDetailsSupport: true,
      },
      completionItemKind: { valueSet: [] },
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
  },
};

export interface FileReferenceLocation {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export interface AssetUsageAnswer {
  version: number | undefined;
  uses: Record<string, (FileReferenceLocation & { role: AssetUseRole; text: string })[]>;
  scripts: { from: string; to: string; divert: boolean }[];
}

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

  protected _publishedDiagnosticsListeners = new Set<
    (params: PublishDiagnosticsParams) => void
  >();

  onPublishedDiagnostics(listener: (params: PublishDiagnosticsParams) => void) {
    this._publishedDiagnosticsListeners.add(listener);
    return () => {
      this._publishedDiagnosticsListeners.delete(listener);
    };
  }

  protected _workspace: {
    configuration: WorkspaceConfiguration;
    window: WorkspaceWindow;
  };

  constructor(workspace: {
    configuration: WorkspaceConfiguration;
    window: WorkspaceWindow;
  }) {
    this._workspace = workspace;
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
            return this._workspace.configuration.settings;
          }
          return {};
        });
        return result;
      },
    );
    this._connection.onNotification(
      CompiledProgramMessage.method,
      (params: CompiledProgramParams) => {
        profilePhase("start", `CompiledProgramMessage`);
        this.updateProgram(params.program);
        sendProtocolMessage(CompiledProgramMessage.type.notification(params));
        profilePhase("end", `CompiledProgramMessage`);
      },
    );
    this._connection.onNotification(
      PublishDiagnosticsMessage.method,
      (params: PublishDiagnosticsParams) => {
        problems.record(params);
        for (const listener of this._publishedDiagnosticsListeners) {
          listener(params);
        }
      },
    );
    this._connection.onClose(() => {
      this.stop();
    });
    this._connection.listen();
    this._workspace.configuration.onDidChange((params) => {
      if (this._initializeResult) {
        this._connection.sendNotification(
          DidChangeConfigurationMessage.method,
          params,
        );
      }
    });
  }

  async start(
    projectPath: string,
    files: { uri: string }[],
  ): Promise<InitializeResult> {
    const uri = this._workspace.window.getOpenedDocumentUri();
    this._initializeParams = {
      rootUri: projectPath,
      processId: null,
      capabilities: CLIENT_CAPABILITIES,
      initializationOptions: {
        settings: this._workspace.configuration.settings,
        files,
        definitions: {
          optionals: DEFAULT_OPTIONAL_DEFINITIONS,
          schemas: DEFAULT_SCHEMA_DEFINITIONS,
          descriptions: DEFAULT_DESCRIPTION_DEFINITIONS,
        },
        uri,
        workspace: projectPath,
        slimProgramNotifications: true,
        stripImageData: true,
        uriPathsAsWritten: true,
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

  async getFileDiagnostics(uri: string): Promise<SparkDiagnostic[]> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<SparkDiagnostic[]>(
        "sparkdown/fileDiagnostics",
        { uri },
      )) ?? []
    );
  }

  async pullDiagnostics(uri: string) {
    await this.initialization();
    const report = await this._connection.sendRequest<DocumentDiagnosticReport | null>(
      "textDocument/diagnostic",
      { textDocument: { uri } },
    );
    if (report?.kind !== "full") {
      return null;
    }
    const version = Number(report.resultId);
    return {
      diagnostics: report.items,
      version: Number.isInteger(version) && version >= 0 ? version : undefined,
    };
  }

  async getDocumentSymbols(uri: string): Promise<DocumentSymbol[]> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<DocumentSymbol[] | null>(
        "textDocument/documentSymbol",
        { textDocument: { uri } },
      )) ?? []
    );
  }

  async getFileReferences(uri: string): Promise<FileReferenceLocation[]> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<FileReferenceLocation[]>(
        "sparkdown/fileReferences",
        { uri },
      )) ?? []
    );
  }

  async getAssetUsage(uri: string): Promise<AssetUsageAnswer | null> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<AssetUsageAnswer | null>(
        "sparkdown/fileReferencesAll",
        { uri },
      )) ?? null
    );
  }

  async getVariantPicture(
    uri: string,
    variant: { image: string; attributes: readonly string[] },
    size: number,
  ): Promise<string | null> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<string | null>(
        "sparkdown/variantPicture",
        { uri, variant, size },
      )) ?? null
    );
  }

  async getScriptReferences(
    uri: string,
  ): Promise<{ from: string; to: string; divert: boolean }[]> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<
        { from: string; to: string; divert: boolean }[]
      >("sparkdown/scriptReferences", { uri })) ?? []
    );
  }

  async findText(params: FindTextParams): Promise<FindTextResult> {
    await this.initialization();
    return this._connection.sendRequest<FindTextResult>(
      FindTextMessage.method,
      params,
    );
  }

  async getReferences(uri: string, position: Position): Promise<Location[]> {
    await this.initialization();
    return (
      (await this._connection.sendRequest<Location[] | null>(
        "textDocument/references",
        {
          textDocument: { uri },
          position,
          context: { includeDeclaration: true },
        },
      )) ?? []
    );
  }

  async getDefinitions(uri: string, position: Position): Promise<Location[]> {
    await this.initialization();
    const result = await this._connection.sendRequest<
      Location | Location[] | LocationLink[] | null
    >("textDocument/definition", { textDocument: { uri }, position });
    const list = result == null ? [] : Array.isArray(result) ? result : [result];
    return list.map((l) =>
      "targetUri" in l
        ? { uri: l.targetUri, range: l.targetSelectionRange }
        : l,
    );
  }

  async prepareRename(uri: string, position: Position): Promise<Range | null> {
    await this.initialization();
    const result = await this._connection.sendRequest<
      Range | { range: Range } | { defaultBehavior: boolean } | null
    >("textDocument/prepareRename", { textDocument: { uri }, position });
    if (!result || "defaultBehavior" in result) {
      return null;
    }
    return "range" in result ? result.range : result;
  }

  async getRenameEdits(
    uri: string,
    position: Position,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    await this.initialization();
    return this._connection.sendRequest<WorkspaceEdit | null>(
      "textDocument/rename",
      { textDocument: { uri }, position, newName },
    );
  }

  async getFileRenameEdits(
    oldUri: string,
    newName: string,
  ): Promise<WorkspaceEdit | null> {
    await this.initialization();
    return this._connection.sendRequest<WorkspaceEdit | null>(
      "sparkdown/fileRenameEdits",
      { oldUri, newName },
    );
  }

  async getOffsetSourceLocation(
    uri: string,
    line: number,
    offset: number,
  ): Promise<{ file: string; line: number } | null> {
    await this.initialization();
    return this._connection.sendRequest<{ file: string; line: number } | null>(
      "sparkdown/offsetSourceLocation",
      { uri, line, offset },
    );
  }

  async getPreviewLine(
    uri: string,
    line: number,
    shownBeat: PreviewLineParams["shownBeat"],
  ): Promise<PreviewLineResult> {
    await this.initialization();
    return this._connection.sendRequest<PreviewLineResult>(
      PreviewLineMessage.method,
      { textDocument: { uri }, line, shownBeat },
    );
  }

  stop() {
    this._connection.dispose();
  }

  updateProgram(program: SparkProgram | undefined) {
    this._program = program;
  }
}
