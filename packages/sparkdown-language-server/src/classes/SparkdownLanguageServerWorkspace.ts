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
import COMPILER_INLINE_WORKER_STRING from "@impower/sparkdown/src/worker/sparkdown.worker";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import {
  type Connection,
  Disposable,
  type DocumentDiagnosticParams,
  type DocumentDiagnosticReport,
  DocumentDiagnosticRequest,
  ErrorCodes,
  ExecuteCommandRequest,
  FileChangeType,
  FoldingRangeRefreshRequest,
  PublishDiagnosticsNotification,
  ResponseError,
  SemanticTokensRefreshRequest,
  TextDocumentSyncKind,
} from "vscode-languageserver";

export class SparkdownLanguageServerWorkspace extends SparkdownWorkspace {
  protected _documents: SparkdownDocumentRegistry;

  protected _workspaceFolders?: { uri: string; name: string }[];
  get workspaceFolders() {
    return this._workspaceFolders;
  }

  _connection: Connection;

  constructor(connection: Connection, profilerId?: string) {
    super(COMPILER_INLINE_WORKER_STRING, profilerId);
    this._documents = new SparkdownDocumentRegistry([
      "characters",
      "colors",
      "declarations",
      "formatting",
      "links",
      "references",
      "semantics",
    ]);
    this._documents.profilerId = profilerId;
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

  override async sendNotification<P, M extends string>(
    method: M,
    params: P,
  ): Promise<void> {
    this._connection?.sendNotification(method, params);
  }

  override async sendRequest<P, M extends string, R>(
    method: M,
    params: P,
  ): Promise<R> {
    return this._connection?.sendRequest(method, params);
  }

  override async getFileText(uri: string): Promise<string> {
    return this._connection.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileText",
      arguments: [uri],
    });
  }

  override async getFileSrc(uri: string): Promise<string> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileSrc",
      arguments: [uri],
    });
  }

  override async getFileVersion(uri: string): Promise<number> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileVersion",
      arguments: [uri],
    });
  }

  override async getFileLanguageId(uri: string): Promise<string> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileLanguageId",
      arguments: [uri],
    });
  }

  override async onOpenTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    this._documents.add(params);
  }

  override async onChangeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    this._documents.update(params);
  }

  override onCompiledTextDocument(params: {
    textDocument?: { uri: string };
    program: any;
  }): void {
    const uris = Array.from(this._documentVersions.keys());
    for (const uri of uris) {
      const version = this._documentVersions.get(uri);
      const diagnostics = this.getDiagnostics(params.program, uri);
      this.sendNotification(PublishDiagnosticsNotification.method, {
        uri,
        diagnostics,
        version,
      });
      this.sendRequest(FoldingRangeRefreshRequest.method, {});
      this.sendRequest(SemanticTokensRefreshRequest.method, {});
    }
  }

  override onCreatedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    if (
      file &&
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this._documents.set({
        textDocument: {
          uri: file.uri,
          text: file.text! || "",
          version: file.version,
          languageId: file.languageId,
        },
      });
    }
  }

  override onChangedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    if (
      file &&
      file.type === "script" &&
      file.version !== undefined &&
      file.languageId !== undefined
    ) {
      this._documents.set({
        textDocument: {
          uri: file.uri,
          text: file.text! || "",
          version: file.version,
          languageId: file.languageId,
        },
      });
    }
  }

  override onDeletedFile(file: {
    uri: string;
    name: string;
    ext: string;
    type: string;
    src?: string;
    text?: string | undefined;
    version?: number | null;
    languageId?: string | null;
  }) {
    this._documents.remove({ textDocument: { uri: file.uri } });
  }

  public listen(): Disposable {
    (this._connection as any).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      this._connection.onRequest(
        DocumentDiagnosticRequest.method,
        async (
          params: DocumentDiagnosticParams,
        ): Promise<DocumentDiagnosticReport> => {
          const uri = params.textDocument.uri;
          const document = this._documents.get(uri);
          const program = await this.compile(uri, false);
          const resultId = `${document?.version ?? -1}`;
          if (document && program) {
            const items = this.getDiagnostics(program, uri);
            return {
              kind: "full",
              resultId,
              items,
            } as DocumentDiagnosticReport;
          }
          return { kind: "unchanged", resultId };
        },
      ),
    );
    disposables.push(
      this._connection.onRequest(
        CompileProgramMessage.method,
        async (
          params: CompileProgramParams,
        ): Promise<SparkProgram | undefined> => {
          return this.compile(params.textDocument.uri, true);
        },
      ),
    );
    disposables.push(
      this._connection.onDidOpenTextDocument((event) => {
        return this.openTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidCloseTextDocument((event) => {
        return this.closeTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidChangeTextDocument((event) => {
        return this.changeTextDocument(event);
      }),
    );
    disposables.push(
      this._connection.onDidChangeWatchedFiles(async (params) => {
        const changes = params.changes;
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Deleted)
            .map((change) => this.deleteFile(change.uri)),
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Created)
            .map((change) => this.createFile(change.uri)),
        );
        await Promise.all(
          changes
            .filter((change) => change.type == FileChangeType.Changed)
            .map((change) => this.changeFile(change.uri)),
        );
      }),
    );
    disposables.push(
      this._connection.onRequest(
        "workspace/textDocumentContent",
        (params: { uri: string }) => {
          const document = this._documents.get(params.uri);
          if (!document) {
            throw new ResponseError(
              ErrorCodes.InvalidRequest,
              `Document does not exist: ${params.uri}`,
            );
          }
          const text = document.getText();
          return { text };
        },
      ),
    );
    return Disposable.create(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}
