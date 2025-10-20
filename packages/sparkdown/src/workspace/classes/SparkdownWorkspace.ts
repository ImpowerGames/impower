import { MessageProtocolRequestType } from "@impower/jsonrpc/src/classes/MessageProtocolRequestType";
import { type ProgressValue } from "@impower/jsonrpc/src/types/ProgressValue";
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

  protected _settings?: SparkdownCompilerConfig;

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _worldFilePattern?: RegExp;

  protected _lastCompiledUri?: string;

  protected _watchedFileUris = new Set<string>();

  protected _programStates = new Map<string, ProgramState>();

  protected _documentVersions = new Map<string, number>();

  protected _onNextCompiled = new Map<
    string,
    ((program: SparkProgram | undefined) => void)[]
  >();

  omitImageData = false;

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
      }
    }
    this._compilerConfig = config;
    await this.sendCompilerRequest(
      ConfigureCompilerMessage.type,
      this._compilerConfig
    );
  }

  async loadFile(file: { uri: string }) {
    const name = this.getFileName(file.uri);
    const type = this.getFileType(file.uri);
    const ext = this.getFileExtension(file.uri);
    const loadedText =
      type === "script" || type === "text" || ext === "svg"
        ? await this.getFileText(file)
        : undefined;
    const src = await this.getFileSrc(file.uri);

    return {
      uri: file.uri,
      name,
      type,
      ext,
      src,
      text: loadedText,
    };
  }

  async getFileText(file: { uri: string; src?: string; text?: string }) {
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
    const text = await this.readTextDocument(file.uri);
    return text;
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
    profile("start", "server/compile", uri);
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
    profile("end", "server/compile", uri);
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

  async onDidOpenTextDocument(params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {
    const textDocument = params.textDocument;
    this.updateCompilerDocument(textDocument, [
      { text: textDocument.text },
    ]).then(() => {
      this.debouncedCompile(textDocument.uri, false);
    });
    this._documentVersions.set(textDocument.uri, textDocument.version);
  }

  async onDidChangeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {
    const textDocument = params.textDocument;
    const contentChanges = params.contentChanges;
    this.updateCompilerDocument(textDocument, contentChanges).then(() => {
      this.compile(textDocument.uri, false);
    });
    this._documentVersions.set(textDocument.uri, textDocument.version);
  }

  async onCreatedFile(uri: string) {
    this._watchedFileUris.add(uri);
    if (this.getFileType(uri) === "script") {
      this._documentVersions.set(uri, 0);
    }
    const file = await this.loadFile({ uri });
    await this.sendCompilerRequest(AddCompilerFileMessage.type, { file });
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
  }

  async onChangedFile(uri: string) {
    if (this.getFileType(uri) !== "script") {
      const file = await this.loadFile({ uri });
      await this.sendCompilerRequest(UpdateCompilerFileMessage.type, { file });
      if (
        this._lastCompiledUri &&
        this.textDocumentExists(this._lastCompiledUri)
      ) {
        await this.debouncedCompile(this._lastCompiledUri, true);
      }
    }
  }

  async onDeletedFile(uri: string) {
    this._watchedFileUris.delete(uri);
    this._programStates.delete(uri);
    this._documentVersions.delete(uri);
    await this.sendCompilerRequest(RemoveCompilerFileMessage.type, {
      file: { uri },
    });
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
  }

  abstract sendNotification<P>(method: string, params: P): Promise<void>;

  abstract readTextDocument(uri: string): Promise<string>;

  abstract getFileSrc(uri: string): Promise<string>;
}
