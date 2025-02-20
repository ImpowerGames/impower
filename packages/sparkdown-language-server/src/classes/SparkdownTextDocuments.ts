import {
  CancellationToken,
  Connection,
  DidChangeConfigurationParams,
  DidChangeTextDocumentParams,
  DidChangeWatchedFilesParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Disposable,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
  DocumentDiagnosticRequest,
  Emitter,
  FileChangeType,
  RequestHandler,
  TextDocumentChangeEvent,
  TextDocumentSyncKind,
  TextDocumentWillSaveEvent,
  TextDocuments,
  TextDocumentsConfiguration,
  TextEdit,
  WillSaveTextDocumentParams,
  WorkspaceFolder,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ConnectionState } from "vscode-languageserver/lib/common/textDocuments";

import {
  DidChangeFileUrlMessage,
  DidChangeFileUrlParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeFileUrlMessage";
import {
  DidWatchFilesMessage,
  DidWatchFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage";
import { ConfigureCompilerMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/ConfigureCompilerMessage";
import { CompileProgramMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/CompileProgramMessage";
import { AddCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/AddCompilerFileMessage";
import { RemoveCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/RemoveCompilerFileMessage";
import { UpdateCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerFileMessage";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { type ProgressValue } from "@impower/spark-editor-protocol/src/types/base/ProgressValue";

import GRAMMAR_DEFINITION from "@impower/sparkdown/language/sparkdown.language-grammar.json";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { type SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";

import { TextmateGrammarParser } from "@impower/sparkdown-document-views/src/cm-textmate/classes/TextmateGrammarParser";

import { type Tree } from "../../../grammar-compiler/src/compiler/classes/Tree";

import { debounce } from "../utils/timing/debounce";
import { getDocumentDiagnostics } from "../utils/providers/getDocumentDiagnostics";

const COMPILER_INLINE_WORKER_STRING = process.env["COMPILER_INLINE_WORKER"]!;

const COMPILER_WORKER_URL = URL.createObjectURL(
  new Blob([COMPILER_INLINE_WORKER_STRING], {
    type: "text/javascript",
  })
);

const PARSE_DELAY = 300;

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i"
  );
};

interface SparkProgramChangeEvent<T> extends TextDocumentChangeEvent<T> {
  program: SparkProgram;
}

export default class SparkdownTextDocuments<
  T extends TextDocument = TextDocument
> extends TextDocuments<T> {
  protected _compilerWorker = new Worker(COMPILER_WORKER_URL);

  protected get __configuration() {
    // @ts-ignore private access
    return this._configuration;
  }

  protected get __syncedDocuments(): Map<string, T> {
    // @ts-ignore private access
    return this._syncedDocuments;
  }

  protected get __onDidChangeContent(): Emitter<TextDocumentChangeEvent<T>> {
    // @ts-ignore private access
    return this._onDidChangeContent;
  }

  protected get __onDidOpen(): Emitter<TextDocumentChangeEvent<T>> {
    // @ts-ignore private access
    return this._onDidOpen;
  }

  protected get __onDidClose(): Emitter<TextDocumentChangeEvent<T>> {
    // @ts-ignore private access
    return this._onDidClose;
  }

  protected get __onDidSave(): Emitter<TextDocumentChangeEvent<T>> {
    // @ts-ignore private access
    return this._onDidSave;
  }

  protected get __onWillSave(): Emitter<TextDocumentWillSaveEvent<T>> {
    // @ts-ignore private access
    return this._onWillSave;
  }

  protected get __willSaveWaitUntil():
    | RequestHandler<TextDocumentWillSaveEvent<T>, TextEdit[], void>
    | undefined {
    // @ts-ignore private access
    return this._willSaveWaitUntil;
  }

  /**
   * An event that fires when a text document has been parsed
   */
  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;
  public get onDidParse() {
    return this._onDidParse.event;
  }

  /**
   * An event that fires when a text document has been parsed
   */
  protected readonly _onUpdateDiagnostics: Emitter<SparkProgramChangeEvent<T>>;
  public get onUpdateDiagnostics() {
    return this._onUpdateDiagnostics.event;
  }

  protected _compilerConfig?: SparkdownCompilerConfig;
  get compilerConfig() {
    return this._compilerConfig;
  }

  protected _syntaxTrees = new Map<string, Tree>();
  get syntaxTrees() {
    return this._syntaxTrees;
  }

  protected _programs = new Map<string, SparkProgram>();
  get programs() {
    return this._programs;
  }

  protected _workspaceFolders?: WorkspaceFolder[];
  get workspaceFolders() {
    return this._workspaceFolders;
  }

  protected _openDocuments = new Set<string>();

  protected _urls: Record<string, string> = {};

  protected _lastParsedUri?: string;

  protected _parsedVersions = new Map<string, number>();

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _parser?: TextmateGrammarParser = new TextmateGrammarParser(
    GRAMMAR_DEFINITION
  );

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._onUpdateDiagnostics = new Emitter<SparkProgramChangeEvent<T>>();
  }

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = [],
    onProgress?: (value: ProgressValue) => void
  ): Promise<R> {
    const request = type.request(params);
    return new Promise<R>((resolve, reject) => {
      const onResponse = (e: MessageEvent) => {
        const message = e.data;
        if (message.id === request.id) {
          if (message.method === `${message.method}/progress`) {
            onProgress?.(message.value);
          } else if (message.result) {
            resolve(message.result);
            this._compilerWorker.removeEventListener("message", onResponse);
          } else if (message.error) {
            reject(message.error);
            this._compilerWorker.removeEventListener("message", onResponse);
          }
        }
      };
      this._compilerWorker.addEventListener("message", onResponse);
      this._compilerWorker.postMessage(request, transfer);
    });
  }

  loadWorkspace(workspaceFolders: WorkspaceFolder[]) {
    this._workspaceFolders = workspaceFolders;
  }

  loadConfiguration(settings: any) {
    const scriptFiles = settings?.scriptFiles;
    if (scriptFiles) {
      this._scriptFilePattern = globToRegex(scriptFiles);
    }
    const imageFiles = settings?.imageFiles;
    if (imageFiles) {
      this._imageFilePattern = globToRegex(imageFiles);
    }
    const audioFiles = settings?.audioFiles;
    if (audioFiles) {
      this._audioFilePattern = globToRegex(audioFiles);
    }
    const fontFiles = settings?.fontFiles;
    if (fontFiles) {
      this._fontFilePattern = globToRegex(fontFiles);
    }
  }

  async loadCompiler(config: SparkdownCompilerConfig) {
    if (config.files) {
      const files = await this.loadFiles(
        Object.entries(config.files).map(([, file]) => ({
          uri: file.uri,
          src: file.src,
        }))
      );
      Object.values(files).forEach((file) => {
        const text = file.text;
        if (file.type === "script" && text) {
          if (!this.__syncedDocuments.get(file.uri)) {
            const language = "sparkdown";
            const version = 0;
            const document = this.__configuration.create(
              file.uri,
              language,
              version,
              text
            );
            this.__syncedDocuments.set(file.uri, document);
          }
        }
      });
      this._compilerConfig = { ...config, files };
      this.sendRequest(ConfigureCompilerMessage.type, this._compilerConfig);
    }
  }

  async loadFiles(files: { uri: string; src: string; text?: string }[]) {
    const filesArray = await Promise.all(
      files.map((file) => this.loadFile(file.uri, file.src, file.text))
    );
    return filesArray.reduce(
      (map, file) => {
        map[file.uri] = file;
        return map;
      },
      {} as Record<
        string,
        {
          uri: string;
          type: string;
          name: string;
          ext: string;
          path: string;
          src: string;
          text?: string;
        }
      >
    );
  }

  async loadFile(uri: string, src: string, text?: string) {
    const name = this.getFileName(uri);
    const type = this.getFileType(uri);
    const ext = this.getFileExtension(uri);
    const path = this.getFilenameWithExtension(uri);
    const loadedText =
      text != null
        ? text
        : src && (type === "script" || type === "text" || ext === "svg")
        ? await this.load(src)
        : undefined;
    const file = {
      uri,
      name,
      type,
      ext,
      path,
      src: src || uri,
      text: loadedText,
    };
    return file;
  }

  async load(src: string) {
    try {
      return await (await fetch(src)).text();
    } catch {}
    return undefined;
  }

  getMainScriptUri(directoryUri: string | undefined) {
    if (directoryUri) {
      return directoryUri + "/" + "main.sd";
    }
    return "";
  }

  getDirectoryUri(uri: string): string {
    return uri.split("/").slice(0, -1).join("/");
  }

  getFilenameWithExtension(uri: string): string {
    return uri.split("/").slice(-1).join("");
  }

  getFileName(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[0]!;
  }

  getFileType(uri: string): string {
    if (this._scriptFilePattern?.test(uri)) {
      return "script";
    }
    if (this._imageFilePattern?.test(uri)) {
      return "image";
    }
    if (this._audioFilePattern?.test(uri)) {
      return "audio";
    }
    if (this._fontFilePattern?.test(uri)) {
      return "font";
    }
    return "text";
  }

  getFileExtension(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[1]!;
  }

  debouncedCompile = debounce((uri: string, force: boolean) => {
    this.compile(uri, force);
  }, PARSE_DELAY);

  async compile(uri: string, force = false) {
    let docChanged = false;
    for (let [, d] of this.__syncedDocuments) {
      const parsedVersion = this._parsedVersions.get(d.uri);
      if (d.version !== parsedVersion) {
        docChanged = true;
      }
      this._parsedVersions.set(d.uri, d.version);
    }
    for (let [uri] of this.__syncedDocuments) {
      if (!this.__syncedDocuments.get(uri)) {
        docChanged = true;
        break;
      }
    }
    let program: SparkProgram | undefined = undefined;
    if (force || docChanged) {
      const targetDocument = this.__syncedDocuments.get(uri);
      if (targetDocument) {
        const directoryUri = this.getDirectoryUri(uri);
        const mainDocument = this.__syncedDocuments.get(
          this.getMainScriptUri(directoryUri)
        );
        if (mainDocument) {
          program = await this.parseDocument(mainDocument);
          this._programs.set(mainDocument.uri, program);
          if (program.sourceMap) {
            for (const uri of Object.keys(program.sourceMap)) {
              this._programs.set(uri, program);
            }
          }
        }
        if (
          targetDocument?.uri !== mainDocument?.uri &&
          !program?.sourceMap?.[uri]
        ) {
          // Target script is not included by main,
          // So it must be parsed on its own to report diagnostics
          if (targetDocument) {
            program = await this.parseDocument(targetDocument);
            this._programs.set(targetDocument.uri, program);
          }
        }
        if (targetDocument && program) {
          this._onDidParse.fire(
            Object.freeze({
              document: targetDocument,
              program,
            })
          );
          this._onUpdateDiagnostics.fire(
            Object.freeze({
              document: targetDocument,
              program,
            })
          );
        }
      }
    }
    return program;
  }

  async parseDocument(document: TextDocument): Promise<SparkProgram> {
    this._lastParsedUri = document.uri;
    return this.sendRequest(CompileProgramMessage.type, {
      uri: document.uri,
    });
  }

  getLatestSyntaxTree(uri: string) {
    return this._syntaxTrees.get(uri);
  }

  getLatestProgram(uri: string) {
    return this._programs.get(uri);
  }

  async onCreatedFile(fileUri: string) {
    const file = await this.loadFile(fileUri, this._urls[fileUri] || "");
    this.sendRequest(AddCompilerFileMessage.type, { uri: fileUri, file });
  }

  onDeletedFile(fileUri: string) {
    this.__syncedDocuments.delete(fileUri);
    this.sendRequest(RemoveCompilerFileMessage.type, { uri: fileUri });
  }

  public override listen(connection: Connection): Disposable {
    (<ConnectionState>(<any>connection)).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      connection.onDidChangeConfiguration(
        (event: DidChangeConfigurationParams) => {
          const settings = event.settings;
          this.loadConfiguration(settings);
        }
      )
    );
    disposables.push(
      connection.onRequest(
        DocumentDiagnosticRequest.method,
        (params: DocumentDiagnosticParams): DocumentDiagnosticReport => {
          const uri = params.textDocument.uri;
          const document = this.get(uri);
          const program = this.programs.get(uri);
          if (document && program) {
            return {
              kind: "full",
              resultId: uri,
              items: getDocumentDiagnostics(document, program).diagnostics,
            };
          }
          return { kind: "unchanged", resultId: uri };
        }
      )
    );
    disposables.push(
      connection.onNotification(
        DidChangeFileUrlMessage.method,
        async (params: DidChangeFileUrlParams) => {
          const uri = params.uri;
          const src = params.src;
          this._urls[uri] = src;
          const file = await this.loadFile(uri, src);
          await this.sendRequest(UpdateCompilerFileMessage.type, { uri, file });
          if (file.type !== "script") {
            // When asset url changes, reparse program so that asset srcs are up-to-date.
            if (this._lastParsedUri) {
              await this.debouncedCompile(this._lastParsedUri, true);
            }
          }
        }
      )
    );
    disposables.push(
      connection.onNotification(
        DidWatchFilesMessage.method,
        async (params: DidWatchFilesParams) => {
          const files = await this.loadFiles(
            params.files.map((watch) => ({
              uri: watch.uri,
              src: this._urls[watch.uri]!,
              text: watch.text,
            }))
          );
          await this.sendRequest(ConfigureCompilerMessage.type, {
            files,
          });
          // Reparse program so that asset srcs are up-to-date.
          if (this._lastParsedUri) {
            await this.debouncedCompile(this._lastParsedUri, true);
          }
        }
      )
    );
    disposables.push(
      connection.onDidOpenTextDocument(
        async (event: DidOpenTextDocumentParams) => {
          const td = event.textDocument;
          const document = this.__configuration.create(
            td.uri,
            td.languageId,
            td.version,
            td.text
          );
          this._openDocuments.add(td.uri);
          this.__syncedDocuments.set(td.uri, document);
          const toFire = Object.freeze({ document });
          this.__onDidOpen.fire(toFire);
          const program = await this.compile(td.uri, false);
          if (program) {
            this._onUpdateDiagnostics.fire(
              Object.freeze({
                document: document,
                program,
              })
            );
          }
        }
      )
    );
    disposables.push(
      connection.onDidChangeTextDocument(
        async (event: DidChangeTextDocumentParams) => {
          const td = event.textDocument;
          const changes = event.contentChanges;
          if (changes.length === 0) {
            return;
          }
          const { version } = td;
          if (version === null || version === undefined) {
            throw new Error(
              `Received document change event for ${td.uri} without valid version identifier`
            );
          }
          let syncedDocument = this.__syncedDocuments.get(td.uri);
          if (syncedDocument) {
            syncedDocument = this.__configuration.update(
              syncedDocument,
              changes,
              version
            );
            if (syncedDocument) {
              this.__syncedDocuments.set(td.uri, syncedDocument);
              this.__onDidChangeContent.fire(
                Object.freeze({ document: syncedDocument })
              );
              // TODO: update syntax tree on text document change
              const file = await this.loadFile(
                td.uri,
                this._urls[td.uri]!,
                syncedDocument.getText()
              );
              await this.sendRequest(UpdateCompilerFileMessage.type, {
                uri: td.uri,
                file,
              });
              await this.debouncedCompile(td.uri, false);
            }
          }
        }
      )
    );
    disposables.push(
      connection.onDidCloseTextDocument(
        async (event: DidCloseTextDocumentParams) => {
          const td = event.textDocument;
          let syncedDocument = this.__syncedDocuments.get(td.uri);
          if (syncedDocument) {
            this.__onDidClose.fire(Object.freeze({ document: syncedDocument }));
            this._openDocuments.delete(syncedDocument.uri);
          }
          if (this._openDocuments.size <= 1) {
            const [openUri] = this._openDocuments;
            const uri =
              openUri ||
              this.getMainScriptUri(this._workspaceFolders?.[0]?.uri);
            const document = this.__syncedDocuments.get(uri);
            if (document) {
              const program = await this.compile(document.uri, false);
              if (program) {
                this._onUpdateDiagnostics.fire(
                  Object.freeze({
                    document,
                    program,
                  })
                );
              }
            }
          }
        }
      )
    );
    disposables.push(
      connection.onWillSaveTextDocument((event: WillSaveTextDocumentParams) => {
        let syncedDocument = this.__syncedDocuments.get(event.textDocument.uri);
        if (syncedDocument !== undefined) {
          this.__onWillSave.fire(
            Object.freeze({ document: syncedDocument, reason: event.reason })
          );
        }
      })
    );
    disposables.push(
      connection.onWillSaveTextDocumentWaitUntil(
        (event: WillSaveTextDocumentParams, token: CancellationToken) => {
          let syncedDocument = this.__syncedDocuments.get(
            event.textDocument.uri
          );
          if (syncedDocument !== undefined && this.__willSaveWaitUntil) {
            return this.__willSaveWaitUntil(
              Object.freeze({ document: syncedDocument, reason: event.reason }),
              token
            );
          } else {
            return [];
          }
        }
      )
    );
    disposables.push(
      connection.onDidSaveTextDocument((event: DidSaveTextDocumentParams) => {
        let syncedDocument = this.__syncedDocuments.get(event.textDocument.uri);
        if (syncedDocument !== undefined) {
          this.__onDidSave.fire(Object.freeze({ document: syncedDocument }));
        }
      })
    );
    disposables.push(
      connection.onDidChangeWatchedFiles(
        (params: DidChangeWatchedFilesParams) => {
          const changes = params.changes;
          changes.forEach((change) => {
            switch (change.type) {
              case FileChangeType.Created:
                this.onCreatedFile(change.uri);
                break;
              case FileChangeType.Changed:
                break;
              case FileChangeType.Deleted:
                this.onDeletedFile(change.uri);
                break;
            }
          });
        }
      )
    );
    return Disposable.create(() => {
      disposables.forEach((disposable) => disposable.dispose());
    });
  }
}
