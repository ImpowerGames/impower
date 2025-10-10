import { AddCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/AddCompilerFileMessage";
import {
  CompileProgramMessage,
  CompileProgramParams,
} from "@impower/spark-editor-protocol/src/protocols/compiler/CompileProgramMessage";
import { CompilerInitializeMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/RemoveCompilerFileMessage";
import { UpdateCompilerDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "@impower/spark-editor-protocol/src/protocols/compiler/UpdateCompilerFileMessage";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { DidCompileTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidCompileTextDocumentMessage";
import { type ProgressValue } from "@impower/spark-editor-protocol/src/types/base/ProgressValue";
import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/classes/SparkdownDocumentRegistry";
import { type SparkdownCompilerConfig } from "@impower/sparkdown/src/types/SparkdownCompilerConfig";
import { type SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { resolveFileUsingImpliedExtension } from "@impower/sparkdown/src/utils/resolveFileUsingImpliedExtension";
import {
  CancellationToken,
  Connection,
  DidChangeTextDocumentParams,
  DidChangeWatchedFilesParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Disposable,
  DocumentDiagnosticParams,
  DocumentDiagnosticReport,
  DocumentDiagnosticRequest,
  ExecuteCommandRequest,
  FileChangeType,
  TextDocumentSyncKind,
  WillSaveTextDocumentParams,
  WorkspaceFolder,
} from "vscode-languageserver";
import { TextDocumentContentChangeEvent } from "vscode-languageserver-textdocument";
import { ConnectionState } from "vscode-languageserver/lib/common/textDocuments";
import COMPILER_INLINE_WORKER_STRING from "../../../sparkdown/src/sparkdown.worker";
import { SparkdownConfiguration } from "../types/SparkdownConfiguration";
import { profile } from "../utils/logging/profile";
import { getDocumentDiagnostics } from "../utils/providers/getDocumentDiagnostics";
import { debounce } from "../utils/timing/debounce";
import { throttle } from "../utils/timing/throttle";

const COMPILER_WORKER_URL = URL.createObjectURL(
  new Blob([COMPILER_INLINE_WORKER_STRING], {
    type: "text/javascript",
  })
);

const THROTTLE_DELAY = 10;
const DEBOUNCE_DELAY = 600;

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
  version: number;
  compilingDocumentVersion?: number;
  compiledDocumentVersion?: number;
}

export default class SparkdownTextDocuments {
  protected _compilerWorker: Worker;

  protected _documents = new SparkdownDocumentRegistry("lsp", [
    "characters",
    "colors",
    "declarations",
    "formatting",
    "links",
    "references",
    "semantics",
  ]);

  get parser() {
    return this._documents.parser;
  }

  protected _connection?: Connection;
  get connection() {
    return this._connection;
  }

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

  protected _settings?: SparkdownConfiguration;

  protected _watchedFileUris = new Set<string>();

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _worldFilePattern?: RegExp;

  protected _lastCompiledUri?: string;

  protected _programStates = new Map<string, ProgramState>();

  protected _onNextCompiled = new Map<
    string,
    ((program: SparkProgram | undefined) => void)[]
  >();

  omitImageData = false;

  /**
   * Create a new text document manager.
   */
  constructor() {
    this._compilerWorker = new Worker(COMPILER_WORKER_URL);
    this._compilerWorker.onerror = (e) => {
      console.error(e);
    };
    this.sendCompilerRequest(CompilerInitializeMessage.type, {});
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
            profile("end", request.method);
            reject(message.error);
            this._compilerWorker.removeEventListener("message", onResponse);
          } else if (message.result !== undefined) {
            profile("end", request.method);
            resolve(message.result);
            this._compilerWorker.removeEventListener("message", onResponse);
          }
        }
      };
      this._compilerWorker.addEventListener("message", onResponse);
      profile("start", request.method);
      profile("start", "send " + request.method);
      this._compilerWorker.postMessage(request, transfer);
      profile("end", "send " + request.method);
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
    const worldFiles = settings?.worldFiles;
    if (worldFiles) {
      this._worldFilePattern = globToRegex(worldFiles);
    }
    this._settings = settings;
  }

  async loadCompiler(config: SparkdownCompilerConfig) {
    if (config.files) {
      for (const file of config.files) {
        this._watchedFileUris.add(file.uri);
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
    this._compilerConfig = config;
    await this.sendCompilerRequest(
      ConfigureCompilerMessage.type,
      this._compilerConfig
    );
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

  async loadFile(file: { uri: string; text?: string }) {
    const name = this.getFileName(file.uri);
    const type = this.getFileType(file.uri);
    const ext = this.getFileExtension(file.uri);
    const loadedText =
      file.text != null
        ? file.text
        : type === "script" || type === "text" || ext === "svg"
        ? await this.loadText(file)
        : undefined;
    const src = await this._connection?.sendRequest(
      ExecuteCommandRequest.type,
      {
        command: "sparkdown.getSrc",
        arguments: [file.uri],
      }
    );

    return {
      uri: file.uri,
      name,
      type,
      ext,
      src,
      text: loadedText,
    };
  }

  async loadText(file: { uri: string; src?: string; text?: string }) {
    if (file.text != null) {
      return file.text;
    }
    const type = this.getFileType(file.uri);
    if (type !== "script") {
      if (file.src) {
        try {
          const text = await (await fetch(file.src)).text();
          return text;
        } catch (e) {
          console.error(file.uri, file.src, e);
        }
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
    if (this._worldFilePattern?.test(uri)) {
      return "world";
    }
    return "text";
  }

  getFileExtension(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[1]!;
  }

  getRenamedUri(uri: string, newName: string): string {
    const ext = this.getFileExtension(uri);
    const directory = this.getDirectoryUri(uri);
    return directory + "/" + newName + "." + ext;
  }

  findFiles(name: string, type: string): string[] {
    const matchingUris: string[] = [];
    for (const uri of this._watchedFileUris) {
      const fileName = this.getFileName(uri);
      const fileType = this.getFileType(uri);
      if (fileName === name && fileType === type) {
        matchingUris.push(uri);
      }
    }
    return matchingUris;
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
    const newState = { version: 0 };
    this._programStates.set(uri, newState);
    return newState;
  }

  throttledCompile = throttle(async (uri: string, force: boolean) => {
    return this.compile(uri, force);
  }, THROTTLE_DELAY);

  debouncedCompile = debounce(async (uri: string, force: boolean) => {
    return this.compile(uri, force);
  }, DEBOUNCE_DELAY);

  async compile(
    uri: string,
    force: boolean
  ): Promise<SparkProgram | undefined> {
    profile("start", "server/compile", uri);
    const document = this._documents.get(uri);
    if (!document) {
      console.error("document not opened: ", uri);
      return undefined;
    }
    let anyDocChanged = false;
    for (let [documentUri] of this._programStates) {
      const state = this.getProgramState(documentUri);
      const document = this._documents.get(documentUri);
      if (state.compiledDocumentVersion !== document?.version) {
        anyDocChanged = true;
      }
    }
    const state = this.getProgramState(uri);
    if (!force && !anyDocChanged && state.program) {
      return state.program;
    }
    if (
      !force &&
      state.compilingDocumentVersion != null &&
      document.version <= state.compilingDocumentVersion
    ) {
      return new Promise((resolve) => {
        const nextCompiledCallbacks = this._onNextCompiled.get(uri) || [];
        nextCompiledCallbacks.push(resolve);
        this._onNextCompiled.set(uri, nextCompiledCallbacks);
      });
    }
    state.compilingDocumentVersion = document?.version;
    let program: SparkProgram | undefined = undefined;
    const mainScriptUri = this.getMainScriptUri(uri);
    if (mainScriptUri) {
      program = await this.compileDocument(mainScriptUri);
      this.getProgramState(mainScriptUri).program = program;
      if (program.scripts) {
        for (const [uri, version] of Object.entries(program.scripts)) {
          const state = this.getProgramState(uri);
          state.program = program;
          state.compilingDocumentVersion = undefined;
          state.compiledDocumentVersion = version;
          state.version++;
          this._onNextCompiled.get(uri)?.forEach((c) => c?.(program));
          this._onNextCompiled.delete(uri);
        }
      }
    }
    if (uri !== mainScriptUri && program?.scripts[uri] == null) {
      // Target script is not included by main,
      // So it must be parsed on its own to report diagnostics
      program = await this.compileDocument(uri);
      const state = this.getProgramState(uri);
      state.program = program;
      state.compilingDocumentVersion = undefined;
      state.compiledDocumentVersion = program?.scripts[uri];
      state.version++;
      this._onNextCompiled.get(uri)?.forEach((c) => c?.(program));
      this._onNextCompiled.delete(uri);
    }
    if (program) {
      program.version = state.version;
      await this.sendProgram(uri, program, state.compiledDocumentVersion);
    }
    profile("end", "server/compile", uri);
    return program;
  }

  async compileDocument(uri: string): Promise<SparkProgram> {
    this._lastCompiledUri = uri;
    const program = await this.sendCompilerRequest(CompileProgramMessage.type, {
      uri,
    });
    return program;
  }

  async sendProgram(
    uri: string,
    program: SparkProgram,
    documentVersion: number | undefined
  ) {
    let programToSend = program;
    if (this.omitImageData) {
      const imageWithoutData: Record<string, object> = {};
      for (const [name, image] of Object.entries(
        program.context?.["image"] || {}
      )) {
        if (image.uri) {
          imageWithoutData[name] = { ...image, data: undefined };
        }
      }
      programToSend = {
        ...program,
        context: {
          ...(program.context || {}),
          image: imageWithoutData,
        },
      };
    }
    await this._connection?.sendNotification(
      DidCompileTextDocumentMessage.method,
      {
        textDocument: {
          uri,
          version: documentVersion,
        },
        program: programToSend,
      }
    );
    await this._connection?.sendDiagnostics(
      getDocumentDiagnostics(uri, program, this.getProgramState(uri).version)
    );
  }

  uris() {
    return this._documents.keys();
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

  annotations(uri: string) {
    return this._documents.annotations(uri);
  }

  async onCreatedFile(uri: string) {
    this._watchedFileUris.add(uri);
    if (this.getFileType(uri) === "script") {
      this._documents.add({
        textDocument: { uri, languageId: "sparkdown", version: 0, text: "" },
      });
    }
    const file = await this.loadFile({
      uri,
    });
    await this.sendCompilerRequest(AddCompilerFileMessage.type, { file });
    if (this._lastCompiledUri && this._documents.get(this._lastCompiledUri)) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
  }

  async onChangedFile(uri: string) {
    if (this.getFileType(uri) !== "script") {
      const file = await this.loadFile({
        uri,
      });
      await this.sendCompilerRequest(UpdateCompilerFileMessage.type, { file });
      if (this._lastCompiledUri && this._documents.get(this._lastCompiledUri)) {
        await this.debouncedCompile(this._lastCompiledUri, true);
      }
    }
  }

  async onDeletedFile(uri: string) {
    this._watchedFileUris.delete(uri);
    this._programStates.delete(uri);
    this._documents.remove({ textDocument: { uri } });
    await this.sendCompilerRequest(RemoveCompilerFileMessage.type, {
      file: { uri },
    });
    if (this._lastCompiledUri && this._documents.get(this._lastCompiledUri)) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
  }

  async updateCompilerDocument(
    textDocument: { uri: string },
    contentChanges: TextDocumentContentChangeEvent[]
  ) {
    await this.sendCompilerRequest(UpdateCompilerDocumentMessage.type, {
      textDocument,
      contentChanges,
    });
  }

  public listen(connection: Connection): Disposable {
    this._connection = connection;
    (<ConnectionState>(<any>connection)).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      connection.onRequest(
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
              items: getDocumentDiagnostics(
                document.uri,
                program,
                document.version
              ).diagnostics,
            };
          }
          return { kind: "unchanged", resultId: uri };
        }
      )
    );
    disposables.push(
      connection.onRequest(
        CompileProgramMessage.method,
        async (
          params: CompileProgramParams
        ): Promise<SparkProgram | undefined> => {
          const uri = params.uri;
          const program = await this.compile(uri, true);
          return program;
        }
      )
    );
    disposables.push(
      connection.onDidChangeWatchedFiles(
        async (params: DidChangeWatchedFilesParams) => {
          const changes = params.changes;
          await Promise.all(
            changes
              .filter((change) => change.type === FileChangeType.Deleted)
              .map((change) => this.onDeletedFile(change.uri))
          );
          await Promise.all(
            changes
              .filter((change) => change.type === FileChangeType.Created)
              .map((change) => this.onCreatedFile(change.uri))
          );
          await Promise.all(
            changes
              .filter((change) => change.type === FileChangeType.Changed)
              .map((change) => this.onChangedFile(change.uri))
          );
        }
      )
    );
    disposables.push(
      connection.onDidOpenTextDocument(
        async (event: DidOpenTextDocumentParams) => {
          const textDocument = event.textDocument;
          this._documents.add(event);
          await this.updateCompilerDocument(event.textDocument, [
            { text: textDocument.text },
          ]);
          this.debouncedCompile(textDocument.uri, false);
        }
      )
    );
    disposables.push(
      connection.onDidChangeTextDocument(
        async (event: DidChangeTextDocumentParams) => {
          this._documents.update(event);
          const textDocument = event.textDocument;
          const contentChanges = event.contentChanges;
          await this.updateCompilerDocument(textDocument, contentChanges);
          // update periodically while user types.
          this.throttledCompile(textDocument.uri, false);
          // ensure final call once user is completely done typing.
          this.debouncedCompile(textDocument.uri, false);
        }
      )
    );
    disposables.push(
      connection.onDidCloseTextDocument(
        (_event: DidCloseTextDocumentParams) => {}
      )
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
