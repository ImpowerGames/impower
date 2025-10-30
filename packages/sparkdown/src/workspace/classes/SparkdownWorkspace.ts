import { Port1MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port1MessageConnection";
import { WorkerMessageConnection } from "@impower/jsonrpc/src/browser/classes/WorkerMessageConnection";
import { File, Range } from "../../compiler";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import { CompiledProgramMessage } from "../../compiler/classes/messages/CompiledProgramMessage";
import {
  CompileProgramMessage,
  CompileProgramResult,
} from "../../compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializeMessage } from "../../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import { SelectCompilerDocumentMessage } from "../../compiler/classes/messages/SelectCompilerDocumentMessage";
import { SelectedCompilerDocumentMessage } from "../../compiler/classes/messages/SelectedCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownDocumentContentChangeEvent } from "../../compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import { type SparkProgram } from "../../compiler/types/SparkProgram";
import { profile } from "../utils/logging/profile";
import { debounce } from "../utils/timing/debounce";

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

export abstract class SparkdownWorkspace {
  protected _compilerChannelConnection: Port1MessageConnection;

  get mainScriptFilename() {
    return "main.sd";
  }

  protected _profilerId?: string;
  get profilerId() {
    return this._profilerId;
  }
  set profilerId(value) {
    this._profilerId = value;
  }

  protected _compilerConfig?: SparkdownCompilerConfig;
  get compilerConfig() {
    return this._compilerConfig;
  }
  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _worldFilePattern?: RegExp;

  protected _lastCompiledUri?: string;

  protected _watchedFiles = new Map<string, File>();

  protected _programStates = new Map<string, ProgramState>();

  protected _documentVersions = new Map<string, number>();

  protected _documentSelected: {
    file: string;
    line: number;
  } | null = null;

  protected _onNextCompiled = new Map<
    string,
    ((program: SparkProgram | undefined) => void)[]
  >();

  omitImageData = false;

  private _resolveInitializingCompiler!: () => void;

  private _initializingCompiler?: Promise<void>;
  get initializingCompiler() {
    if (this._initializedCompiler) {
      return Promise.resolve();
    }
    return this._initializingCompiler;
  }

  protected _initializedCompiler = false;
  get initializedCompiler() {
    return this._initializedCompiler;
  }

  constructor(compilerInlineWorkerContent: string, profilerId?: string) {
    this._profilerId = profilerId;
    const compilerWorker = new Worker(
      URL.createObjectURL(
        new Blob([compilerInlineWorkerContent], {
          type: "text/javascript",
        })
      )
    );
    compilerWorker.onerror = (e) => {
      console.error(e);
    };
    const channel = new MessageChannel();
    const workerConnection = new WorkerMessageConnection(compilerWorker);
    this._compilerChannelConnection = new Port1MessageConnection(channel.port1);
    if (this._profilerId) {
      this._compilerChannelConnection.profile(
        this._profilerId + " " + "workspace"
      );
    }
    this.connectToWorker(workerConnection, channel.port2);
  }

  protected async connectToWorker(
    workerConnection: WorkerMessageConnection,
    port2: MessagePort
  ) {
    this._initializingCompiler = new Promise<void>((resolve) => {
      this._resolveInitializingCompiler = resolve;
    });
    await this._compilerChannelConnection.connect(workerConnection, port2);
    await this._compilerChannelConnection.sendRequest(
      CompilerInitializeMessage.type,
      {
        profilerId: this._profilerId,
      }
    );
    this._initializedCompiler = true;
    this._resolveInitializingCompiler();
  }

  async initialize(
    initializationOptions: {
      settings: {
        scriptFiles?: string;
        imageFiles?: string;
        audioFiles?: string;
        fontFiles?: string;
        worldFiles?: string;
      };
      uri?: string;
      omitImageData?: boolean;
      files?: { uri: string; src?: string; text?: string }[];
    } & Omit<SparkdownCompilerConfig, "files">
  ) {
    const { omitImageData, settings, uri, ...compilerConfig } =
      initializationOptions;
    if (omitImageData != null) {
      this.omitImageData = omitImageData;
    }
    if (settings) {
      this.loadConfiguration(settings);
    }
    if (compilerConfig.startFrom) {
      this._documentSelected = compilerConfig.startFrom;
    }
    const files = compilerConfig.files
      ? await Promise.all(
          compilerConfig.files.map(async (file) => {
            const uri = file.uri;
            const name = this.getFileName(file.uri);
            const ext = this.getFileExtension(file.uri);
            const type = this.getFileType(file.uri);
            const [src, text] = await Promise.all([
              file.src ? file.src : this.getFileSrc(file.uri),
              type === "script" || type === "text" || ext === "svg"
                ? file.text
                  ? file.text
                  : this.getFileText(file.uri)
                : undefined,
            ]);
            const watchedFile = { uri, name, ext, type, src, text };
            this._watchedFiles.set(watchedFile.uri, watchedFile);
            this.onCreatedFile(watchedFile);
            return watchedFile;
          })
        )
      : undefined;
    await this.loadCompiler({
      ...compilerConfig,
      files,
    });
    const program = uri ? await this.compile(uri, true) : undefined;
    return { program };
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
  }

  async loadCompiler(config: SparkdownCompilerConfig) {
    this._compilerConfig = config;
    if (!this._initializedCompiler) {
      await this._initializingCompiler;
    }
    return this._compilerChannelConnection.sendRequest(
      ConfigureCompilerMessage.type,
      config
    );
  }

  async loadFile(file: { uri: string }) {
    const name = this.getFileName(file.uri);
    const type = this.getFileType(file.uri);
    const ext = this.getFileExtension(file.uri);
    const [src, text] = await Promise.all([
      this.getFileSrc(file.uri),
      type === "script" || type === "text" || ext === "svg"
        ? this.getFileText(file.uri)
        : undefined,
    ]);

    return {
      uri: file.uri,
      name,
      type,
      ext,
      src,
      text,
    };
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
    return "";
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
    for (const uri of Object.keys(this._watchedFiles)) {
      const fileName = this.getFileName(uri);
      const fileType = this.getFileType(uri);
      if (fileName === name && fileType === type) {
        matchingUris.push(uri);
      }
    }
    return matchingUris;
  }

  getMainScriptUri(uri: string): string | undefined {
    if (!uri) {
      return undefined;
    }
    // Search upwards through directories for closest main file
    const directoryUri = this.getDirectoryUri(uri);
    const mainScriptUri = directoryUri + "/" + this.mainScriptFilename;
    if (this._watchedFiles.has(mainScriptUri)) {
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

  textDocumentExists(uri: string) {
    return this._documentVersions.get(uri) != null;
  }

  protected async updateCompilerDocument(
    textDocument: { uri: string },
    contentChanges: SparkdownDocumentContentChangeEvent[]
  ) {
    return this._compilerChannelConnection.sendRequest(
      UpdateCompilerDocumentMessage.type,
      {
        textDocument,
        contentChanges,
      }
    );
  }

  debouncedCompile = debounce(async (uri: string, force: boolean) => {
    return this.compile(uri, force);
  }, DEBOUNCE_DELAY);

  async compile(
    uri: string,
    force: boolean
  ): Promise<SparkProgram | undefined> {
    profile("start", this._profilerId, "workspace" + " " + "compile", uri);
    let anyDocChanged = false;
    for (let [documentUri] of this._programStates) {
      const state = this.getProgramState(documentUri);
      if (
        state.compiledDocumentVersion !==
        this._documentVersions.get(documentUri)
      ) {
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
      this._documentVersions.get(uri)! <= state.compilingDocumentVersion
    ) {
      return new Promise((resolve) => {
        const nextCompiledCallbacks = this._onNextCompiled.get(uri) || [];
        nextCompiledCallbacks.push(resolve);
        this._onNextCompiled.set(uri, nextCompiledCallbacks);
      });
    }
    state.compilingDocumentVersion = this._documentVersions.get(uri);
    let result: CompileProgramResult | undefined = undefined;
    const mainScriptUri = this.getMainScriptUri(uri);
    if (mainScriptUri) {
      result = await this.compileDocument(mainScriptUri);
      this.getProgramState(mainScriptUri).program = result.program;
      if (result.program.scripts) {
        for (const [uri, version] of Object.entries(result.program.scripts)) {
          const state = this.getProgramState(uri);
          state.program = result.program;
          state.compilingDocumentVersion = undefined;
          state.compiledDocumentVersion = version;
          state.version++;
          this._onNextCompiled.get(uri)?.forEach((c) => c?.(result?.program));
          this._onNextCompiled.delete(uri);
        }
      }
    }
    if (uri !== mainScriptUri && result?.program?.scripts[uri] == null) {
      // Target script is not included by main,
      // So it must be parsed on its own to report diagnostics
      result = await this.compileDocument(uri);
      const state = this.getProgramState(uri);
      state.program = result.program;
      state.compilingDocumentVersion = undefined;
      state.compiledDocumentVersion = result.program?.scripts[uri];
      state.version++;
      this._onNextCompiled.get(uri)?.forEach((c) => c?.(result?.program));
      this._onNextCompiled.delete(uri);
    }
    if (result?.program) {
      result.program.version = state.version;
      this.sendNotification(CompiledProgramMessage.method, result);
    }
    profile("end", this._profilerId, "workspace" + " " + "compile", uri);
    return result?.program;
  }

  protected async compileDocument(uri: string) {
    this._lastCompiledUri = uri;
    const result = await this._compilerChannelConnection.sendRequest(
      CompileProgramMessage.type,
      {
        textDocument: { uri },
        startFrom: this._documentSelected,
      }
    );
    return result;
  }

  program(uri: string) {
    return this.getProgramState(uri).program;
  }

  async openTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    const textDocument = params.textDocument;
    this._documentVersions.set(textDocument.uri, textDocument.version);
    this.updateCompilerDocument(textDocument, [
      { text: textDocument.text },
    ]).then(() => {
      this.debouncedCompile(textDocument.uri, false);
    });
    this.onOpenTextDocument(params);
  }

  async changeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    const textDocument = params.textDocument;
    const contentChanges = params.contentChanges;
    this._documentVersions.set(textDocument.uri, textDocument.version);
    this.updateCompilerDocument(textDocument, contentChanges).then(() => {
      this.compile(textDocument.uri, false);
    });
    this.onChangeTextDocument(params);
  }

  async selectTextDocument(params: {
    textDocument: { uri: string };
    selectedRange: Range;
    docChanged: boolean;
    userEvent?: boolean;
  }) {
    const { textDocument, selectedRange } = params;
    this._documentSelected = {
      file: textDocument.uri,
      line: selectedRange.start.line,
    };
    this.onSelectTextDocument(params);
    const result = await this._compilerChannelConnection.sendRequest(
      SelectCompilerDocumentMessage.type,
      params
    );
    this.sendNotification(SelectedCompilerDocumentMessage.method, result);
    return result;
  }

  async createFile(uri: string) {
    if (this.getFileType(uri) === "script") {
      this._documentVersions.set(uri, 0);
    }
    const file = await this.loadFile({ uri });
    this._watchedFiles.set(uri, file);
    this.onCreatedFile(file);
    await this._compilerChannelConnection.sendRequest(
      AddCompilerFileMessage.type,
      { file }
    );
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
    return file;
  }

  async changeFile(uri: string) {
    const type = this.getFileType(uri);
    if (type && type !== "script") {
      const file = await this.loadFile({ uri });
      this._watchedFiles.set(uri, file);
      this.onChangedFile(file);
      await this._compilerChannelConnection.sendRequest(
        UpdateCompilerFileMessage.type,
        { file }
      );
      if (
        this._lastCompiledUri &&
        this.textDocumentExists(this._lastCompiledUri)
      ) {
        await this.debouncedCompile(this._lastCompiledUri, true);
      }
      return file;
    }
    return this._watchedFiles.get(uri);
  }

  async deleteFile(uri: string) {
    const deletedFile = this._watchedFiles.get(uri);
    this._watchedFiles.delete(uri);
    this._programStates.delete(uri);
    this._documentVersions.delete(uri);
    this.onDeletedFile(deletedFile!);
    await this._compilerChannelConnection.sendRequest(
      RemoveCompilerFileMessage.type,
      {
        file: { uri },
      }
    );
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
    return deletedFile;
  }

  onOpenTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {}

  onChangeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {}

  onSelectTextDocument(params: {
    textDocument: { uri: string };
    selectedRange: Range;
    docChanged: boolean;
    userEvent?: boolean;
  }) {}

  onDeletedFile(file: File) {}

  onChangedFile(file: File) {}

  onCreatedFile(file: File) {}

  abstract sendNotification<P>(method: string, params: P): Promise<void>;

  abstract getFileText(uri: string): Promise<string>;

  abstract getFileSrc(uri: string): Promise<string>;
}
