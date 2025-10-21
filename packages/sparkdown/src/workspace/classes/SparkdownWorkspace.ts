import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { type ProgressValue } from "@impower/jsonrpc/src/types/ProgressValue";
import { File } from "../../compiler";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import { CompiledProgramMessage } from "../../compiler/classes/messages/CompiledProgramMessage";
import { CompileProgramMessage } from "../../compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializeMessage } from "../../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../../compiler/classes/messages/ConfigureCompilerMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import { SparkdownDocumentContentChangeEvent } from "../../compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import { type SparkdownCompilerDefinitions } from "../../compiler/types/SparkdownCompilerDefinitions";
import { type SparkProgram } from "../../compiler/types/SparkProgram";
import COMPILER_INLINE_WORKER_STRING from "../../worker/sparkdown.worker";
import { profile } from "../utils/logging/profile";
import { debounce } from "../utils/timing/debounce";

const COMPILER_WORKER_URL = URL.createObjectURL(
  new Blob([COMPILER_INLINE_WORKER_STRING], {
    type: "text/javascript",
  })
);

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
  protected _compilerWorker: Worker;

  protected _compilerConfig?: SparkdownCompilerConfig;
  get compilerConfig() {
    return this._compilerConfig;
  }

  get mainScriptFilename() {
    return "main.sd";
  }

  protected _profilerId?: string;

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _worldFilePattern?: RegExp;

  protected _lastCompiledUri?: string;

  protected _watchedFiles = new Map<string, File>();

  protected _programStates = new Map<string, ProgramState>();

  protected _documentVersions = new Map<string, number>();

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

  constructor(profilerId?: string) {
    this._profilerId = profilerId;
    this._compilerWorker = new Worker(COMPILER_WORKER_URL);
    this._compilerWorker.onerror = (e) => {
      console.error(e);
    };
    this._initializingCompiler = new Promise<void>((resolve) => {
      this._resolveInitializingCompiler = resolve;
    });
    this.sendCompilerRequest(CompilerInitializeMessage.type, {
      profilerId,
    }).then(() => {
      this._initializedCompiler = true;
      this._resolveInitializingCompiler();
    });
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
            profile(
              "end",
              this._profilerId,
              "workspace" + " " + request.method
            );
            reject(message.error);
            this._compilerWorker.removeEventListener("message", onResponse);
          } else if (message.result !== undefined) {
            profile(
              "end",
              this._profilerId,
              "workspace" + " " + request.method
            );
            resolve(message.result);
            this._compilerWorker.removeEventListener("message", onResponse);
          }
        }
      };
      this._compilerWorker.addEventListener("message", onResponse);
      profile("start", this._profilerId, "workspace" + " " + request.method);
      profile(
        "start",
        this._profilerId,
        "workspace" + " " + "send " + request.method
      );
      this._compilerWorker.postMessage(request, transfer);
      profile(
        "end",
        this._profilerId,
        "workspace" + " " + "send " + request.method
      );
    });
  }

  async initialize(initializationOptions: {
    settings: {
      scriptFiles?: string;
      imageFiles?: string;
      audioFiles?: string;
      fontFiles?: string;
      worldFiles?: string;
    };
    definitions?: {
      builtins?: any;
      optionals?: any;
      schemas?: any;
      descriptions?: any;
    };
    files?: { uri: string; src?: string; text?: string }[];
    skipValidation?: boolean;
    uri?: string;
    omitImageData?: boolean;
  }) {
    const { omitImageData, settings, definitions, files, skipValidation, uri } =
      initializationOptions;
    if (omitImageData != null) {
      this.omitImageData = omitImageData;
    }
    if (settings) {
      this.loadConfiguration(settings);
    }
    await this.loadCompiler({
      definitions,
      files,
      skipValidation,
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

  async loadCompiler(config: {
    definitions?: SparkdownCompilerDefinitions;
    files?: { uri: string; src?: string; text?: string }[];
    skipValidation?: boolean;
  }) {
    const definitions = config.definitions;
    const files = config.files
      ? await Promise.all(
          config.files.map(async (file) => {
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
    const skipValidation = config.skipValidation;
    this._compilerConfig = {
      definitions,
      files,
      skipValidation,
    };
    await this._initializingCompiler;
    await this.sendCompilerRequest(
      ConfigureCompilerMessage.type,
      this._compilerConfig
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
    await this.sendCompilerRequest(UpdateCompilerDocumentMessage.type, {
      textDocument,
      contentChanges,
    });
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
    profile("end", this._profilerId, "workspace" + " " + "compile", uri);
    return program;
  }

  protected async compileDocument(uri: string): Promise<SparkProgram> {
    this._lastCompiledUri = uri;
    const program = await this.sendCompilerRequest(CompileProgramMessage.type, {
      uri,
    });
    return program;
  }

  protected async sendProgram(
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
    this.sendNotification(CompiledProgramMessage.method, {
      textDocument: {
        uri,
        version: documentVersion,
      },
      program: programToSend,
    });
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

  async createFile(uri: string) {
    if (this.getFileType(uri) === "script") {
      this._documentVersions.set(uri, 0);
    }
    const file = await this.loadFile({ uri });
    this._watchedFiles.set(uri, file);
    this.onCreatedFile(file);
    await this.sendCompilerRequest(AddCompilerFileMessage.type, { file });
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
      await this.sendCompilerRequest(UpdateCompilerFileMessage.type, { file });
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
    await this.sendCompilerRequest(RemoveCompilerFileMessage.type, {
      file: { uri },
    });
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

  onDeletedFile(file: File) {}

  onChangedFile(file: File) {}

  onCreatedFile(file: File) {}

  abstract sendNotification<P>(method: string, params: P): Promise<void>;

  abstract getFileText(uri: string): Promise<string>;

  abstract getFileSrc(uri: string): Promise<string>;
}
