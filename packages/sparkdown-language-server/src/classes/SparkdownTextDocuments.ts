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
  TextDocumentChangeEvent,
  TextDocumentSyncKind,
  TextDocumentsConfiguration,
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
import { UpdateCompilerDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerDocumentMessage";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { type ProgressValue } from "@impower/spark-editor-protocol/src/types/base/ProgressValue";

import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { type SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/classes/SparkdownDocumentRegistry";

import { debounce } from "../utils/timing/debounce";
import { getDocumentDiagnostics } from "../utils/providers/getDocumentDiagnostics";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";

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

interface ProgramState {
  program?: SparkProgram;
  programVersion?: number;
}

export default class SparkdownTextDocuments {
  protected _compilerWorker: Worker;

  protected _documents = new SparkdownDocumentRegistry();

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

  protected _watchedFileUris = new Set<string>();

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _urls: Record<string, string> = {};

  protected _lastCompiledUri?: string;

  protected _programStates = new Map<string, ProgramState>();

  /**
   * Create a new text document manager.
   */
  constructor() {
    this._compilerWorker = new Worker(COMPILER_WORKER_URL);
    this._compilerWorker.onerror = (e) => {
      console.error(e);
    };
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
          } else if (message.error !== undefined) {
            reject(message.error);
            this._compilerWorker.removeEventListener("message", onResponse);
          } else if (message.result !== undefined) {
            resolve(message.result);
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
      for (const uri of Object.keys(config.files)) {
        this._watchedFileUris.add(uri);
      }
      const files = await this.loadFiles(Object.values(config.files));
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

  getProgramState(uri: string): ProgramState {
    const state = this._programStates.get(uri);
    if (state) {
      return state;
    }
    const newState = {};
    this._programStates.set(uri, newState);
    return newState;
  }

  debouncedCompile = debounce((uri: string, force: boolean) => {
    this.compile(uri, force);
  }, PARSE_DELAY);

  async compile(uri: string, force = false) {
    let docChanged = false;
    for (let [documentUri] of this._programStates) {
      const state = this.getProgramState(documentUri);
      const document = this._documents.get(documentUri);
      if (document) {
        if (document.version !== state.programVersion) {
          docChanged = true;
        }
        state.programVersion = document.version;
      }
    }
    let program: SparkProgram | undefined = undefined;
    if (force || docChanged) {
      const mainScriptUri = this.getMainScriptUri(uri);
      if (mainScriptUri) {
        program = await this.compileDocument(mainScriptUri);
        this.getProgramState(mainScriptUri).program = program;
        if (program.sourceMap) {
          for (const uri of Object.keys(program.sourceMap)) {
            this.getProgramState(uri).program = program;
          }
        }
      }
      if (uri !== mainScriptUri && !program?.sourceMap?.[uri]) {
        // Target script is not included by main,
        // So it must be parsed on its own to report diagnostics
        program = await this.compileDocument(uri);
        this.getProgramState(uri).program = program;
      }
      if (program) {
        this.sendProgram(uri, program);
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

  get(uri: string) {
    return this._documents.get(uri);
  }

  program(uri: string) {
    return this.getProgramState(uri).program;
  }

  tree(uri: string) {
    return this._documents.tree(uri);
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
    if (!this._documents.get(uri)) {
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
    this._programStates.delete(uri);
    this._documents.remove({ textDocument: { uri } });
    this.sendCompilerRequest(RemoveCompilerFileMessage.type, { uri });
  }

  sendProgram(uri: string, program: SparkProgram) {
    this._connection?.sendNotification(DidParseTextDocumentMessage.method, {
      textDocument: {
        uri: uri,
        version: this.getProgramState(uri).programVersion,
      },
      program,
    });
    this._connection?.sendDiagnostics(getDocumentDiagnostics(uri, program));
  }

  async updateCompilerDocument(
    textDocument: { uri: string },
    contentChanges: TextDocumentContentChangeEvent[]
  ) {
    await this.sendCompilerRequest(UpdateCompilerDocumentMessage.type, {
      textDocument,
      contentChanges,
    });
    this.debouncedCompile(textDocument.uri, false);
  }

  public listen(connection: Connection): Disposable {
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
          const document = this._documents.get(uri);
          const program = this.getProgramState(uri).program;
          if (document && program) {
            return {
              kind: "full",
              resultId: uri,
              items: getDocumentDiagnostics(document.uri, program).diagnostics,
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
    disposables.push(
      connection.onDidOpenTextDocument((event: DidOpenTextDocumentParams) => {
        const textDocument = event.textDocument;
        this.compile(textDocument.uri, false);
        this._documents.add(event);
      })
    );
    disposables.push(
      connection.onDidChangeTextDocument(
        async (event: DidChangeTextDocumentParams) => {
          this.updateCompilerDocument(event.textDocument, event.contentChanges);
          this._documents.update(event);
        }
      )
    );
    disposables.push(
      connection.onDidCloseTextDocument((event: DidCloseTextDocumentParams) => {
        this._documents.remove(event);
      })
    );
    disposables.push(
      connection.onWillSaveTextDocument(
        (_event: WillSaveTextDocumentParams) => {}
      )
    );
    disposables.push(
      connection.onWillSaveTextDocumentWaitUntil(
        (_event: WillSaveTextDocumentParams, _token: CancellationToken) => []
      )
    );
    disposables.push(
      connection.onDidSaveTextDocument(
        (_event: DidSaveTextDocumentParams) => {}
      )
    );
    return Disposable.create(() => {
      for (const disposable of disposables) {
        disposable.dispose();
      }
    });
  }
}
