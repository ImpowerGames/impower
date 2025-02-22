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
  ExecuteCommandRequest,
  FileChangeType,
  Range,
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
import {
  TextDocument,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";
import { ConnectionState } from "vscode-languageserver/lib/common/textDocuments";

import {
  DidChangeFileUrlMessage,
  DidChangeFileUrlParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeFileUrlMessage";
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

import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { Input, Tree, TreeFragment } from "@lezer/common";

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

interface SparkProgramChangeEvent<T extends TextDocument>
  extends TextDocumentChangeEvent<T> {
  program: SparkProgram;
}

interface DocumentState {
  tree?: Tree;
  fragments?: readonly TreeFragment[];
  treeVersion?: number;
  program?: SparkProgram;
  programVersion?: number;
}

class StringInput implements Input {
  constructor(private readonly input: string) {}

  get length() {
    return this.input.length;
  }

  chunk(from: number): string {
    return this.input.slice(from);
  }

  lineChunks = false;

  read(from: number, to: number): string {
    return this.input.slice(from, to);
  }
}

export default class SparkdownTextDocuments<
  T extends TextDocument = TextDocument
> extends TextDocuments<T> {
  protected _compilerWorker: Worker;

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

  protected _connection?: Connection;

  protected _compilerConfig?: SparkdownCompilerConfig;
  get compilerConfig() {
    return this._compilerConfig;
  }

  protected _workspaceFolders?: WorkspaceFolder[];
  get workspaceFolders() {
    return this._workspaceFolders;
  }

  get mainScriptFilename() {
    return "main.sd";
  }

  protected _parser: TextmateGrammarParser = new TextmateGrammarParser(
    GRAMMAR_DEFINITION
  );

  protected _watchedFileUris = new Set<string>();

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _urls: Record<string, string> = {};

  protected _lastCompiledUri?: string;

  protected _documentStates = new Map<string, DocumentState>();

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._compilerWorker = new Worker(COMPILER_WORKER_URL);
    this._compilerWorker.onerror = (e) => {
      console.error(e);
    };
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._onUpdateDiagnostics = new Emitter<SparkProgramChangeEvent<T>>();
  }

  protected async sendCompilerRequest<M extends string, P, R>(
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
      const files = await this.loadFiles(Object.values(config.files));
      for (const file of Object.values(files)) {
        this._watchedFileUris.add(file.uri);
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
      }
      this._compilerConfig = { ...config, files };
      this.sendCompilerRequest(
        ConfigureCompilerMessage.type,
        this._compilerConfig
      );
    }
  }

  async loadFiles(files: { uri: string; src: string; text?: string }[]) {
    const filesArray = await Promise.all(
      files.map((file) => this.loadFile(file))
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

  async loadFile(file: { uri: string; src: string; text?: string }) {
    const name = this.getFileName(file.uri);
    const type = this.getFileType(file.uri);
    const ext = this.getFileExtension(file.uri);
    const path = this.getFilenameWithExtension(file.uri);
    const loadedText =
      file.text != null
        ? file.text
        : type === "script" || type === "text" || ext === "svg"
        ? await this.loadText(file)
        : undefined;

    return {
      uri: file.uri,
      name,
      type,
      ext,
      path,
      src: file.src || file.uri,
      text: loadedText,
    };
  }

  async loadText(file: { uri: string; src: string; text?: string }) {
    if (file.text != null) {
      return file.text;
    }
    if (file.src) {
      try {
        const text = await (await fetch(file.src)).text();
        return text;
      } catch (e) {
        console.error(e);
      }
    }
    // TODO: handle fetching latest text with workspace/textDocumentContent/refresh instead?
    const result = await this._connection?.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: "sparkdown.readTextDocument",
        arguments: [file.uri],
      }
    );
    return result?.text;
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

  getDocumentState(uri: string): DocumentState {
    const state = this._documentStates.get(uri);
    if (state) {
      return state;
    }
    const newState = {};
    this._documentStates.set(uri, newState);
    return newState;
  }

  getMainScriptUri(uri: string): string | undefined {
    if (!uri) {
      return undefined;
    }
    // Search upwards through directories for closest main file
    const directoryUri = this.getDirectoryUri(uri);
    const mainScriptUri = directoryUri + "/" + this.mainScriptFilename;
    if (this._watchedFileUris.has(mainScriptUri)) {
      return mainScriptUri;
    }
    return this.getMainScriptUri(directoryUri);
  }

  debouncedCompile = debounce((uri: string, force: boolean) => {
    this.compile(uri, force);
  }, PARSE_DELAY);

  async compile(uri: string, force = false) {
    let docChanged = false;
    for (let [documentUri] of this._documentStates) {
      const state = this.getDocumentState(documentUri);
      const document = this.__syncedDocuments.get(documentUri);
      if (document) {
        if (document.version !== state.programVersion) {
          docChanged = true;
        }
        state.programVersion = document.version;
      }
    }
    let program: SparkProgram | undefined = undefined;
    if (force || docChanged) {
      const targetDocument = this.__syncedDocuments.get(uri);
      if (targetDocument) {
        const mainScriptUri = this.getMainScriptUri(uri);
        if (mainScriptUri) {
          program = await this.compileDocument(mainScriptUri);
          this.getDocumentState(mainScriptUri).program = program;
          if (program.sourceMap) {
            for (const uri of Object.keys(program.sourceMap)) {
              this.getDocumentState(uri).program = program;
            }
          }
        }
        if (
          targetDocument?.uri !== mainScriptUri &&
          !program?.sourceMap?.[uri]
        ) {
          // Target script is not included by main,
          // So it must be parsed on its own to report diagnostics
          if (targetDocument) {
            program = await this.compileDocument(targetDocument.uri);
            this.getDocumentState(targetDocument.uri).program = program;
          }
        }
        if (targetDocument && program) {
          this._onDidParse.fire(
            Object.freeze({
              document: targetDocument,
              program,
            })
          );
          this.sendDiagnostics(targetDocument, program);
        }
      }
    }
    return program;
  }

  async compileDocument(uri: string): Promise<SparkProgram> {
    this._lastCompiledUri = uri;
    return this.sendCompilerRequest(CompileProgramMessage.type, {
      uri,
    });
  }

  updateSyntaxTree(
    beforeDocument: T,
    afterDocument: T,
    changes?: readonly TextDocumentContentChangeEvent[]
  ): Tree {
    const state = this.getDocumentState(afterDocument.uri);
    if (state.tree && state.treeVersion === afterDocument.version) {
      // Return cached tree if up to date
      return state.tree;
    }
    if (changes && state.fragments) {
      performance.mark(`incremental parse ${beforeDocument.uri} start`);
      // Incremental parse
      let changeDocument = TextDocument.create(
        beforeDocument.uri,
        beforeDocument.languageId,
        beforeDocument.version,
        beforeDocument.getText()
      );
      for (const change of changes) {
        const c: {
          range: Range;
          text: string;
        } =
          "range" in change
            ? {
                range: change.range,
                text: change.text,
              }
            : {
                range: {
                  start: { line: 0, character: 0 },
                  end: changeDocument.positionAt(Number.MAX_VALUE),
                },
                text: change.text,
              };
        const treeChange = {
          fromA: changeDocument.offsetAt(c.range.start),
          toA: changeDocument.offsetAt(c.range.end),
          fromB: changeDocument.offsetAt(c.range.start),
          toB: changeDocument.offsetAt(c.range.start) + c.text.length,
        };
        // We must apply these changes to the tree one at a time because
        // TextDocumentContentChangeEvent[] positions are relative to the doc after each change,
        // and ChangedRange[] positions are relative to the starting doc.
        state.fragments = TreeFragment.applyChanges(state.fragments, [
          treeChange,
        ]);
        changeDocument = TextDocument.update(
          changeDocument,
          [c],
          changeDocument.version + 1
        );
        const input = new StringInput(changeDocument.getText());
        state.tree = this._parser.parse(input, state.fragments);
        state.fragments = TreeFragment.addTree(state.tree, state.fragments);
      }
      state.treeVersion = afterDocument.version;
      performance.mark(`incremental parse ${beforeDocument.uri} end`);
      performance.measure(
        `incremental parse ${beforeDocument.uri}`,
        `incremental parse ${beforeDocument.uri} start`,
        `incremental parse ${beforeDocument.uri} end`
      );
      return state.tree!;
    } else {
      // First full parse
      performance.mark(`full parse ${beforeDocument.uri} start`);
      const input = new StringInput(afterDocument.getText());
      state.tree = this._parser.parse(input);
      state.fragments = TreeFragment.addTree(state.tree);
      state.treeVersion = afterDocument.version;
      performance.mark(`full parse ${beforeDocument.uri} end`);
      performance.measure(
        `full parse ${beforeDocument.uri}`,
        `full parse ${beforeDocument.uri} start`,
        `full parse ${beforeDocument.uri} end`
      );
      return state.tree;
    }
  }

  async updateCompilerDocument(document: T) {
    const file = await this.loadFile({
      uri: document.uri,
      src: this._urls[document.uri]!,
      text: document.getText(),
    });
    return this.sendCompilerRequest(UpdateCompilerFileMessage.type, {
      uri: document.uri,
      file,
    });
  }

  getLatestProgram(uri: string) {
    return this.getDocumentState(uri).program;
  }

  getLatestSyntaxTree(uri: string) {
    return this.getDocumentState(uri).tree;
  }

  async onCreatedFile(uri: string) {
    this._watchedFileUris.add(uri);
    const file = await this.loadFile({
      uri,
      src: this._urls[uri] || "",
    });
    this.sendCompilerRequest(AddCompilerFileMessage.type, {
      uri,
      file,
    });
  }

  async onChangedFile(uri: string) {
    if (!this.__syncedDocuments.get(uri)) {
      const file = await this.loadFile({
        uri,
        src: this._urls[uri] || "",
      });
      this.sendCompilerRequest(UpdateCompilerFileMessage.type, {
        uri,
        file,
      });
    }
  }

  onDeletedFile(uri: string) {
    this._watchedFileUris.delete(uri);
    this.__syncedDocuments.delete(uri);
    this._documentStates.delete(uri);
    this.sendCompilerRequest(RemoveCompilerFileMessage.type, { uri });
  }

  sendDiagnostics(document: T, program: SparkProgram) {
    this._onUpdateDiagnostics.fire(
      Object.freeze({
        document,
        program,
      })
    );
  }

  public override listen(connection: Connection): Disposable {
    this._connection = connection;
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
          const program = this.getDocumentState(uri).program;
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
          const file = await this.loadFile({ uri, src });
          await this.sendCompilerRequest(UpdateCompilerFileMessage.type, {
            uri,
            file,
          });
          if (file.type !== "script") {
            // When asset url changes, reparse program so that asset srcs are up-to-date.
            if (this._lastCompiledUri) {
              await this.debouncedCompile(this._lastCompiledUri, true);
            }
          }
        }
      )
    );
    disposables.push(
      connection.onDidOpenTextDocument((event: DidOpenTextDocumentParams) => {
        const td = event.textDocument;
        const document = this.__configuration.create(
          td.uri,
          td.languageId,
          td.version,
          td.text
        );
        this.__syncedDocuments.set(td.uri, document);
        const toFire = Object.freeze({ document });
        this.__onDidOpen.fire(toFire);
        const type = this.getFileType(td.uri);
        if (type === "script") {
          const beforeDocument = TextDocument.create(
            td.uri,
            td.languageId,
            -1,
            ""
          ) as T;
          this.updateSyntaxTree(beforeDocument, document);
          this.compile(td.uri, false);
        }
      })
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
            const beforeDocument = TextDocument.create(
              syncedDocument.uri,
              syncedDocument.languageId,
              syncedDocument.version,
              syncedDocument.getText()
            ) as T;
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
              const type = this.getFileType(td.uri);
              if (type === "script") {
                this.updateSyntaxTree(beforeDocument, syncedDocument, changes);
                this.updateCompilerDocument(syncedDocument);
                await this.debouncedCompile(td.uri, false);
              } else {
                const file = await this.loadFile({
                  uri: syncedDocument.uri,
                  src: this._urls[syncedDocument.uri] || "",
                  text: syncedDocument.getText(),
                });
                this.sendCompilerRequest(UpdateCompilerFileMessage.type, {
                  uri: syncedDocument.uri,
                  file,
                });
              }
            }
          }
        }
      )
    );
    disposables.push(
      connection.onDidCloseTextDocument((event: DidCloseTextDocumentParams) => {
        const td = event.textDocument;
        let syncedDocument = this.__syncedDocuments.get(td.uri);
        if (syncedDocument) {
          this.__syncedDocuments.delete(syncedDocument.uri);
          this._documentStates.delete(syncedDocument.uri);
          this.__onDidClose.fire(Object.freeze({ document: syncedDocument }));
        }
        const mainScriptUri = this.getMainScriptUri(td.uri);
        if (
          mainScriptUri &&
          td.uri !== mainScriptUri &&
          this._lastCompiledUri === td.uri
        ) {
          this.compile(mainScriptUri, false);
        }
      })
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
          for (const change of changes) {
            switch (change.type) {
              case FileChangeType.Created:
                this.onCreatedFile(change.uri);
                break;
              case FileChangeType.Changed:
                this.onChangedFile(change.uri);
                break;
              case FileChangeType.Deleted:
                this.onDeletedFile(change.uri);
                break;
            }
          }
        }
      )
    );
    return Disposable.create(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}
