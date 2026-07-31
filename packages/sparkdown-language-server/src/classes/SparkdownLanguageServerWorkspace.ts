import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/sparkdown/src/compiler/classes/messages/CompileProgramMessage";
import {
  SparkdownDocumentContentChangeEvent,
  SparkdownDocumentRegistry,
} from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { type SparkProgram } from "@impower/sparkdown/src/compiler/types/SparkProgram";
import { buildSVGSource } from "@impower/sparkdown/src/compiler/utils/buildSVGSource";
import { resolveFileUsingImpliedExtension } from "@impower/sparkdown/src/compiler/utils/resolveFileUsingImpliedExtension";
import COMPILER_INLINE_WORKER_STRING from "@impower/sparkdown/src/worker/sparkdown.worker";
import { SparkdownWorkspace } from "@impower/sparkdown/src/workspace/classes/SparkdownWorkspace";
import { diffDirtyRange } from "../utils/providers/getFormatDirtyRange";
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
      "lenses",
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

  // Last formatted output per document — the diff baseline for
  // incremental (delta) formatting. Always a genuine format output (see
  // diffDirtyRange's safety note), so the span between it and the current
  // text bounds everything that might need reformatting.
  protected _lastFormattedText = new Map<string, string>();

  // The byte range that may need reformatting since the last format, or
  // undefined for a full format (no baseline yet). `currentText` is the
  // document's current text.
  formatDirtyRange(
    uri: string,
    currentText: string,
  ): { from: number; to: number } | undefined {
    const baseline = this._lastFormattedText.get(uri);
    if (baseline == null) {
      return undefined;
    }
    return diffDirtyRange(baseline, currentText) ?? { from: 0, to: 0 };
  }

  markFormatted(uri: string, formattedText: string) {
    this._lastFormattedText.set(uri, formattedText);
  }

  clearFormatCache(uri: string) {
    this._lastFormattedText.delete(uri);
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

  override async getFileBytes(uri: string): Promise<string | undefined> {
    return this._connection?.sendRequest(ExecuteCommandRequest.type, {
      command: "sparkdown.getFileBytes",
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

  override async initialize(
    params: Parameters<SparkdownWorkspace["initialize"]>[0],
  ) {
    const result = await super.initialize(params);
    this.scheduleBackgroundParses();
    return result;
  }

  /**
   * Project scripts are registered with deferred parses (see onCreatedFile)
   * so initialize can return immediately. Warm them here in the background --
   * smallest first, one per tick so early feature requests aren't stuck
   * behind the whole project -- because some features (e.g. completions) read
   * every script's annotations and would otherwise pay all outstanding
   * parses at once on first use. tree() is a no-op for anything already
   * parsed on demand in the meantime.
   */
  protected scheduleBackgroundParses() {
    const uris = Array.from(this._documents.keys()).sort(
      (a, b) =>
        (this._documents.get(a)?.length ?? 0) -
        (this._documents.get(b)?.length ?? 0),
    );
    let i = 0;
    const step = () => {
      if (i >= uris.length) {
        return;
      }
      const uri = uris[i++]!;
      try {
        // The document can have been removed since the list was captured;
        // touching it would just recreate an empty registry state entry.
        if (this._documents.has(uri)) {
          this._documents.tree(uri);
        }
      } catch (e) {
        console.error("background parse failed", uri, e);
      }
      setTimeout(step, 50);
    };
    setTimeout(step, 500);
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

  // Fingerprint + published-at version of the last diagnostics publish per
  // uri, so a compile only notifies files whose diagnostics actually changed.
  // Every publish fans out into client-side feature re-pulls, so N identical
  // publishes per compile multiply into real work. The VERSION must be part
  // of the key: clients that declare versionSupport DROP a publish whose
  // version trails their document (routine mid-typing, since compiles are
  // debounced with a max-wait), so an identical-content publish at a NEWER
  // version must still go out or the client keeps stale squiggles forever.
  protected _lastPublishedDiagnostics = new Map<
    string,
    { fingerprint: string; version: number | undefined }
  >();

  /**
   * Under `stripImageData` (#299) the program's image structs arrive without
   * their inlined SVG source, but LS-side previews (hover/completion
   * `filterImage` calls, composite previews) still read `image.data` — and in
   * VS Code the markdown sanitizer only loads http(s)/data: srcs, so previews
   * of FILTERED svgs must stay data-URI-based. Attach a lazy, self-memoizing
   * `data` getter that rebuilds the source from `_watchedFiles` (which
   * retains every svg's text and refreshes it on change) on first access —
   * so nothing pays for it until a preview actually needs it.
   */
  protected attachLazyImageData(program: {
    context?: { image?: Record<string, any> };
  }): void {
    const images = program?.context?.image;
    if (!images) {
      return;
    }
    for (const image of Object.values(images)) {
      if (
        !image ||
        typeof image !== "object" ||
        "data" in image ||
        image.ext !== "svg" ||
        typeof image.uri !== "string"
      ) {
        continue;
      }
      Object.defineProperty(image, "data", {
        configurable: true,
        enumerable: true,
        get: () => {
          const text = this._watchedFiles.get(image.uri)?.text;
          const value = text ? buildSVGSource(text) : undefined;
          Object.defineProperty(image, "data", {
            configurable: true,
            enumerable: true,
            writable: true,
            value,
          });
          return value;
        },
      });
    }
  }

  override onCompiledTextDocument(params: {
    textDocument?: { uri: string };
    program: any;
  }): void {
    this.attachLazyImageData(params.program);
    const uris = Array.from(this._documentVersions.keys());
    for (const uri of uris) {
      const version = this._documentVersions.get(uri);
      const diagnostics = this.getDiagnostics(params.program, uri);
      const fingerprint = JSON.stringify(diagnostics);
      const last = this._lastPublishedDiagnostics.get(uri);
      if (last && last.fingerprint === fingerprint && last.version === version) {
        continue;
      }
      this._lastPublishedDiagnostics.set(uri, { fingerprint, version });
      this.sendNotification(PublishDiagnosticsNotification.method, {
        uri,
        diagnostics,
        version,
      });
    }
    // These refreshes are workspace-wide and carry no params, so once per
    // compile is lossless. (They used to be sent inside the loop above --
    // 2 x tracked-uris redundant refresh storms per keystroke, each of which
    // made clients re-pull folding/semantic tokens for every visible file.)
    this.sendRequest(FoldingRangeRefreshRequest.method, {});
    this.sendRequest(SemanticTokensRefreshRequest.method, {});
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
      // Defer the parse: this fires for EVERY project script during
      // initialize, but this registry only serves language-feature requests,
      // which arrive for documents the user actually has open. Eagerly
      // parsing the whole project here (with all annotators) cost many
      // seconds of time-to-first-interaction on large projects (#224/#285).
      this._documents.set(
        {
          textDocument: {
            uri: file.uri,
            text: file.text! || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
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
      // Only unopened scripts arrive here (see SparkdownWorkspace.changeFile);
      // defer their re-parse until something reads them.
      this._documents.set(
        {
          textDocument: {
            uri: file.uri,
            text: file.text! || "",
            version: file.version,
            languageId: file.languageId,
          },
        },
        { defer: true },
      );
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
    this._lastFormattedText.delete(file.uri);
    this._lastPublishedDiagnostics.delete(file.uri);
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
          // Tolerate the bare `{ uri }` shape older clients sent.
          const uri =
            params.textDocument?.uri ?? (params as { uri?: string }).uri;
          if (!uri) {
            return undefined;
          }
          // force=false: when nothing changed since the last compile this
          // serves the cached program WITHOUT re-compiling or re-notifying.
          // A forced compile here re-broadcast compiler/didCompile, and
          // pull-on-didCompile consumers (the vscode compilation view) would
          // chase their own tail in an infinite pull->compile->notify loop.
          return this.compile(uri, false);
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
