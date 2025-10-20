import {
  CompiledProgramMessage,
  CompiledProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompiledProgramMessage";
import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import {
  SparkdownDocumentContentChangeEvent,
  SparkdownDocumentRegistry,
} from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { resolveFileUsingImpliedExtension } from "@impower/sparkdown/src/compiler/utils/resolveFileUsingImpliedExtension";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import {
  type Connection,
  Disposable,
  type DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  DocumentDiagnosticRequest,
  ExecuteCommandRequest,
  FileChangeType,
  TextDocumentSyncKind,
} from "vscode-languageserver";

export class SparkdownLanguageServerWorkspace extends SparkdownWorkspace {
  protected _documents = new SparkdownDocumentRegistry("language", [
    "characters",
    "colors",
    "declarations",
    "formatting",
    "links",
    "references",
    "semantics",
  ]);

  protected _workspaceFolders?: { uri: string; name: string }[];
  get workspaceFolders() {
    return this._workspaceFolders;
  }

  _connection: Connection;

  constructor(connection: Connection) {
    super();
    this._connection = connection;
  }

  loadDocuments(config: {
    files: {
      uri: string;
      name: string;
      ext: string;
      type: string;
      text?: string;
    }[];
  }) {
    if (config.files) {
      for (const file of config.files) {
        file.name = this.getFileName(file.uri);
        file.ext = this.getFileExtension(file.uri);
        file.type = this.getFileType(file.uri);
        if (file.type === "script") {
          this._documents.add({
            textDocument: {
              uri: file.uri,
              languageId: "sparkdown",
              version: 0,
              text: file.text || "",
            },
          });
        }
      }
    }
  }

  loadWorkspaceFolders(workspaceFolders: { uri: string; name: string }[]) {
    this._workspaceFolders = workspaceFolders;
  }

  resolve(rootUri: string, path: string): string | undefined {
    for (const ext of this._documents.parser.grammar.definition.fileTypes || [
      "",
    ]) {
      const uri = resolveFileUsingImpliedExtension(rootUri, path, ext);
      if (this._documents.has(uri)) {
        return uri;
      }
    }
    return undefined;
  }

  uris() {
    return this._documents.keys();
  }

  document(uri: string) {
    return this._documents.get(uri);
  }

  tree(uri: string) {
    return this._documents.tree(uri);
  }

  annotations(uri: string) {
    return this._documents.annotations(uri);
  }

  override async sendNotification<P>(method: string, params: P): Promise<void> {
    this._connection?.sendNotification(method, params);
    if (method === CompiledProgramMessage.method) {
      // When sending 'compiler/didCompile' notification, also send 'textDocument/publishDiagnostics' notification
      const compiledProgramParams = params as CompiledProgramParams;
      const uri = compiledProgramParams.textDocument.uri;
      const program = compiledProgramParams.program;
      const diagnostics = program.diagnostics?.[uri] || [];
      const version = this.getProgramState(uri).version;
      this._connection.sendDiagnostics({
        uri,
        diagnostics,
        version,
      });
    }
  }

  override async readTextDocument(uri: string): Promise<string> {
    // TODO: handle fetching latest text with workspace/textDocumentContent/refresh instead?
    return this._connection.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.readTextDocument",
      arguments: [uri],
    });
  }

  override async getFileSrc(uri: string): Promise<string> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getSrc",
      arguments: [uri],
    });
  }

  override async onDidOpenTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    super.onDidOpenTextDocument(params);
    this._documents.add(params);
  }

  override async onDidChangeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    super.onDidChangeTextDocument(params);
    this._documents.update(params);
  }

  override async onCreatedFile(uri: string) {
    if (this.getFileType(uri) === "script") {
      this._documents.add({
        textDocument: { uri, languageId: "sparkdown", version: 0, text: "" },
      });
    }
    await super.onCreatedFile(uri);
  }

  override async onDeletedFile(uri: string) {
    this._documents.remove({ textDocument: { uri } });
    await super.onDeletedFile(uri);
  }

  public listen(): Disposable {
    (this._connection as any).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      this._connection.onRequest(
        DocumentDiagnosticRequest.method,
        async (
          params: DocumentDiagnosticParams
        ): Promise<DocumentDiagnosticReport> => {
          const uri = params.textDocument.uri;
          const document = this._documents.get(uri);
          const program = await this.compile(uri, false);
          if (document && program) {
            return {
              kind: "full",
              resultId: uri,
              items: program.diagnostics?.[uri] || [],
            };
          }
          return { kind: "unchanged", resultId: uri };
        }
      )
    );
    disposables.push(
      this._connection.onRequest(
        CompileProgramMessage.method,
        async (
          params: CompileProgramParams
        ): Promise<SparkProgram | undefined> => {
          return this.compile(params.uri, true);
        }
      )
    );
    disposables.push(
      this._connection.onDidOpenTextDocument((event) => {
        return this.onDidOpenTextDocument(event);
      })
    );
    disposables.push(
      this._connection.onDidChangeTextDocument((event) => {
        return this.onDidChangeTextDocument(event);
      })
    );
    disposables.push(
      this._connection.onDidChangeWatchedFiles(async (params) => {
        const changes = params.changes;
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Deleted)
            .map((change) => this.onDeletedFile(change.uri))
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Created)
            .map((change) => this.onCreatedFile(change.uri))
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Changed)
            .map((change) => this.onChangedFile(change.uri))
        );
      })
    );
    return Disposable.create(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}
