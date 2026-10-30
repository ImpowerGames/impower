import { ImageVocabularyCache, imageFileForCompiler } from "../utils/prepareImageFile";
import { Port1MessageConnection } from "@impower/jsonrpc/src/browser/classes/Port1MessageConnection";
import { WorkerMessageConnection } from "@impower/jsonrpc/src/browser/classes/WorkerMessageConnection";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { File,Range } from "../../compiler";
import { AddCompilerFileMessage } from "../../compiler/classes/messages/AddCompilerFileMessage";
import {
  CompiledProgramMessage,
  type CompiledProgramParams,
  type DiagnosticsSummary,
} from "../../compiler/classes/messages/CompiledProgramMessage";
import {
  CompileProgramMessage,
  type CompileProgramResult,
} from "../../compiler/classes/messages/CompileProgramMessage";
import { CompilerInitializeMessage } from "../../compiler/classes/messages/CompilerInitializeMessage";
import { ConfigureCompilerMessage } from "../../compiler/classes/messages/ConfigureCompilerMessage";
import {
  LocateProgramMessage,
  type LocateQuery,
} from "../../compiler/classes/messages/LocateProgramMessage";
import {
  PreviewCompileProgramMessage,
  type PreviewCompileProgramResult,
} from "../../compiler/classes/messages/PreviewCompileProgramMessage";
import { RemoveCompilerFileMessage } from "../../compiler/classes/messages/RemoveCompilerFileMessage";
import {
  SelectCompilerDocumentMessage,
  type SelectCompilerDocumentResult,
} from "../../compiler/classes/messages/SelectCompilerDocumentMessage";
import { SelectedCompilerDocumentMessage } from "../../compiler/classes/messages/SelectedCompilerDocumentMessage";
import { UpdateCompilerDocumentMessage } from "../../compiler/classes/messages/UpdateCompilerDocumentMessage";
import { UpdateCompilerFileMessage } from "../../compiler/classes/messages/UpdateCompilerFileMessage";
import type { SparkdownDocumentContentChangeEvent } from "../../compiler/classes/SparkdownDocumentRegistry";
import { type SparkdownCompilerConfig } from "../../compiler/types/SparkdownCompilerConfig";
import type {
  AsyncProgramLocator,
  LineBeat,
  ProgramAddress,
  SourceLocation,
} from "../../compiler/types/ProgramAddress";
import { type SparkProgram } from "../../compiler/types/SparkProgram";
import { isSameProgram } from "../../compiler/utils/programSummary";
import { playRefusalOf } from "../../compiler/utils/startScene";
import { profile } from "../utils/logging/profile";
import { ProgramTransportDecoder } from "../utils/programTransport";
import { debounce } from "../utils/timing/debounce";

const DEBOUNCE_DELAY = 600;

const summarizeDiagnostics = (
  diagnostics: SparkProgram["diagnostics"],
): DiagnosticsSummary => {
  const summary: DiagnosticsSummary = {};
  if (diagnostics) {
    for (const [uri, fileDiagnostics] of Object.entries(diagnostics)) {
      const counts = { errors: 0, warnings: 0, infos: 0 };
      for (const d of fileDiagnostics) {
        if (d.severity === 1) {
          counts.errors++;
        } else if (d.severity === 2) {
          counts.warnings++;
        } else {
          counts.infos++;
        }
      }
      summary[uri] = counts;
    }
  }
  return summary;
};

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );
};

export class CompilerRestartedError extends Error {
  override name = "CompilerRestartedError";
  constructor() {
    super("The compiler's worker was restarted before it answered");
  }
}

const unlessRestarted = (e: unknown) => {
  if (!(e instanceof CompilerRestartedError)) {
    throw e;
  }
};

interface ProgramState {
  program?: SparkProgram;
  version: number;
  compilingDocumentVersion?: number;
  compiledDocumentVersion?: number;
}

export interface ClientCapabilities {
  textDocument?: {
    diagnostic?: {
      dynamicRegistration?: boolean;
      relatedDocumentSupport?: boolean;
      markupMessageSupport?: boolean;
    };
    codeAction?: object;
  };
}

export abstract class SparkdownWorkspace {
  protected _compilerChannelConnection!: Port1MessageConnection;

  protected _compilerInlineWorkerContent: string;

  protected _compilerWorkerUrl?: string;

  protected _compilerWorker?: Worker;

  protected _mirrorDocumentTexts = false;

  protected _documentTexts = new Map<string, TextDocument>();

  protected _configuredDocumentVersions = new Map<string, number>();

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

  protected _clientCapabilities?: ClientCapabilities;
  get clientCapabilities() {
    return this._clientCapabilities;
  }

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _videoFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  protected _worldFilePattern?: RegExp;

  protected _urlTypeCache = new Map<string, string>();

  protected _lastCompiledUri?: string;

  protected _watchedFiles = new Map<string, File>();

  protected _imageVocabularyCache = new ImageVocabularyCache();

  protected _programStates = new Map<string, ProgramState>();

  protected _documentVersions = new Map<string, number>();

  protected _documentSelected?: {
    file: string;
    line: number;
  };

  protected _openDocuments = new Set<string>();

  protected _onNextCompiled = new Map<
    string,
    ((program: SparkProgram | undefined) => void)[]
  >();

  omitImageData = false;

  slimProgramNotifications = false;

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

  protected _compilerConfigured = false;
  protected _resolveCompilerConfigured?: () => void;
  protected _compilerConfiguring = new Promise<void>((resolve) => {
    this._resolveCompilerConfigured = resolve;
  });
  get whenCompilerConfigured(): Promise<void> {
    if (this._compilerConfigured) {
      return Promise.resolve();
    }
    return this._compilerConfiguring;
  }

  protected _projectLoaded = false;
  protected _resolveProjectLoaded?: () => void;
  protected _projectLoading = new Promise<void>((resolve) => {
    this._resolveProjectLoaded = resolve;
  });

  protected markProjectLoaded() {
    this._projectLoaded = true;
    this._resolveProjectLoaded?.();
  }

  constructor(compilerInlineWorkerContent: string, profilerId?: string) {
    this._profilerId = profilerId;
    this._compilerInlineWorkerContent = compilerInlineWorkerContent;
    this.startCompilerWorker();
  }

  protected createCompilerWorker(): Worker {
    this._compilerWorkerUrl ??= URL.createObjectURL(
      new Blob([this._compilerInlineWorkerContent], {
        type: "text/javascript",
      }),
    );
    return new Worker(this._compilerWorkerUrl);
  }

  protected startCompilerWorker() {
    const compilerWorker = this.createCompilerWorker();
    compilerWorker.onerror = (e) => {
      console.error(e);
    };
    this._compilerWorker = compilerWorker;
    const channel = new MessageChannel();
    const workerConnection = new WorkerMessageConnection(compilerWorker);
    this._compilerChannelConnection = new Port1MessageConnection(channel.port1);
    if (this._profilerId) {
      this._compilerChannelConnection.profile(
        this._profilerId + " " + "workspace",
      );
    }
    this.connectToWorker(workerConnection, channel.port2);
  }

  async restartCompiler(): Promise<void> {
    const previous = this._compilerChannelConnection;
    this._compilerWorker?.terminate();
    this._initializedCompiler = false;
    this._compilerConfigured = false;
    const resolvePrevious = this._resolveCompilerConfigured;
    this._compilerConfiguring = new Promise<void>((resolve) => {
      this._resolveCompilerConfigured = () => {
        resolve();
        resolvePrevious?.();
      };
    });
    this._programTransport = new ProgramTransportDecoder();
    this.startCompilerWorker();
    this.onCompilerRestarted(this._compilerChannelConnection);
    previous.abandon(new CompilerRestartedError());
    previous.close();
    const config = this._compilerConfig;
    if (!config) {
      return;
    }
    try {
      await this.loadCompiler({
        ...config,
        files: this.currentCompilerFiles(),
        startFrom: this.compileStartFrom(),
      });
    } catch (e) {
      unlessRestarted(e);
      return;
    }
    const uri = this._lastCompiledUri;
    if (uri) {
      await this.compile(uri, true);
    }
  }

  protected currentCompilerFiles(): File[] {
    const files: File[] = [];
    this._configuredDocumentVersions.clear();
    for (const [uri, file] of this._watchedFiles) {
      const document = this._documentTexts.get(uri);
      const current = document
        ? { ...file, text: document.getText(), version: document.version }
        : file;
      if (document) {
        this._configuredDocumentVersions.set(uri, document.version);
      }
      files.push(
        imageFileForCompiler(current, this._compilerConfig?.stripImageData),
      );
    }
    return files;
  }

  protected onCompilerRestarted(_connection: Port1MessageConnection) {}

  protected async connectToWorker(
    workerConnection: WorkerMessageConnection,
    port2: MessagePort,
  ) {
    this._initializingCompiler = new Promise<void>((resolve) => {
      this._resolveInitializingCompiler = resolve;
    });
    await this._compilerChannelConnection.connect(workerConnection, port2);
    await this._compilerChannelConnection.sendRequest(
      CompilerInitializeMessage.type,
      {
        profilerId: this._profilerId,
      },
    );
    this._initializedCompiler = true;
    this._resolveInitializingCompiler();
  }

  async initialize(params: {
    rootUri: string | null;
    capabilities: ClientCapabilities;
    workspaceFolders?:
      | {
          uri: string;
          name: string;
        }[]
      | null;
    initializationOptions?: {
      settings: {
        scriptFiles?: string;
        imageFiles?: string;
        audioFiles?: string;
        videoFiles?: string;
        fontFiles?: string;
        worldFiles?: string;
      };
      uri?: string;
      omitImageData?: boolean;
      slimProgramNotifications?: boolean;
      compileDebounceDelay?: number;
      files?: Omit<File, "type" | "name" | "ext">[];
    } & Omit<SparkdownCompilerConfig, "files">;
  }): Promise<{
    textDocuments?: {
      uri: string;
      text: string;
      version: number | null;
      languageId: string | null;
    }[];
  }> {
    this._clientCapabilities = params.capabilities;
    try {
      return await this.loadProject(params);
    } finally {
      this.markProjectLoaded();
      if (!this._compilerConfig) {
        this._resolveCompilerConfigured?.();
      }
    }
  }

  protected async loadProject(
    params: Parameters<SparkdownWorkspace["initialize"]>[0],
  ): ReturnType<SparkdownWorkspace["initialize"]> {
    if (params.initializationOptions) {
      const {
        omitImageData,
        slimProgramNotifications,
        compileDebounceDelay,
        settings,
        uri,
        ...compilerConfig
      } = params.initializationOptions;
      if (omitImageData != null) {
        this.omitImageData = omitImageData;
      }
      if (slimProgramNotifications != null) {
        this.slimProgramNotifications = slimProgramNotifications;
      }
      if (compileDebounceDelay != null) {
        this._changeCompileDebounceDelay = compileDebounceDelay;
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
              let ext = this.getFileExtension(file.uri);
              let type = this.getFileType(file.uri);
              const urlResolved = await this.resolveUrlAssetType(ext, file.text);
              if (urlResolved) {
                type = urlResolved.type;
                ext = urlResolved.ext;
              }
              const [src, text, version, languageId] = await Promise.all([
                file.src ?? this.getFileSrc(file.uri),
                type === "script" || type === "text" || ext.toLowerCase() === "svg"
                  ? (file.text ?? this.getFileText(file.uri))
                  : undefined,
                file.version !== undefined
                  ? file.version
                  : this.getFileVersion(file.uri),
                file.languageId !== undefined
                  ? file.languageId
                  : this.getFileLanguageId(file.uri),
              ]);
              const watchedFile = this._imageVocabularyCache.prepare({
                uri,
                name,
                ext,
                type,
                src,
                text,
                version,
                languageId,
              });
              this._watchedFiles.set(watchedFile.uri, watchedFile);
              this.onCreatedFile(watchedFile);
              return imageFileForCompiler(watchedFile, compilerConfig.stripImageData);
            }),
          )
        : undefined;
      const workspace =
        compilerConfig.workspace ??
        params.workspaceFolders?.[0]?.uri ??
        params.rootUri ??
        undefined;
      (async () => {
        await this.loadCompiler({
          ...compilerConfig,
          workspace,
          files,
        });
        if (uri) {
          await this.compile(uri, true);
        }
      })().catch((err) => {
        console.error("compiler configuration failed", err);
      });
      const textDocuments: {
        uri: string;
        text: string;
        version: number | null;
        languageId: string | null;
      }[] = [];
      for (const [, file] of this._watchedFiles) {
        if (
          file &&
          file.version !== undefined &&
          file.languageId !== undefined
        ) {
          textDocuments.push({
            ...file,
            text: file.text || "",
            version: file.version,
            languageId: file.languageId!,
          });
        }
      }
      return { textDocuments };
    }
    return {};
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
    const videoFiles = settings?.videoFiles;
    if (videoFiles) {
      this._videoFilePattern = globToRegex(videoFiles);
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
    config = { mainScriptFilename: this.mainScriptFilename, ...config };
    this._compilerConfig = config;
    if (!this._initializedCompiler) {
      await this._initializingCompiler;
    }
    return this.configureCompiler(config);
  }

  async configureCompiler(config: SparkdownCompilerConfig) {
    const connection = this._compilerChannelConnection;
    try {
      return await connection.sendRequest(ConfigureCompilerMessage.type, config);
    } finally {
      if (this._compilerChannelConnection === connection) {
        this._compilerConfigured = true;
        this._resolveCompilerConfigured?.();
      }
    }
  }

  async loadFile(file: { uri: string }) {
    const name = this.getFileName(file.uri);
    const type = this.getFileType(file.uri);
    const ext = this.getFileExtension(file.uri);
    const [src, text, version, languageId] = await Promise.all([
      this.getFileSrc(file.uri),
      type === "script" || type === "text" || ext.toLowerCase() === "svg"
        ? this.getFileText(file.uri)
        : undefined,
      this.getFileVersion(file.uri),
      this.getFileLanguageId(file.uri),
    ]);

    return this._imageVocabularyCache.prepare({
      uri: file.uri,
      version,
      name,
      type,
      ext,
      src,
      text,
      languageId,
    });
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
    if (this._videoFilePattern?.test(uri)) {
      return "video";
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
    const filename = this.getFilenameWithExtension(uri);
    const dot = filename.lastIndexOf(".");
    return dot < 0 ? "" : filename.slice(dot + 1);
  }

  protected async resolveUrlAssetType(
    ext: string,
    urlText: string | undefined,
  ): Promise<{ type: string; ext: string } | null> {
    if (ext !== "url") {
      return null;
    }
    const url = (urlText ?? "").trim();
    if (!url) {
      return null;
    }
    const urlPath = url.split(/[?#]/)[0] || "";
    const urlExt = this.getFileExtension(urlPath);
    let type = this.getFileType(urlPath);
    if (!urlExt) {
      const headType = await this.resolveUrlTypeViaHead(url);
      if (headType) {
        type = headType;
      }
    }
    return {
      type,
      ext: urlExt || ext,
    };
  }

  protected categoryFromContentType(contentType: string): string {
    const t = (contentType.split(";")[0] || "").trim().toLowerCase();
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("font/") || t.includes("font")) return "font";
    if (t.startsWith("text/")) return "text";
    return "";
  }

  protected async resolveUrlTypeViaHead(url: string): Promise<string> {
    const cached = this._urlTypeCache.get(url);
    if (cached !== undefined) {
      return cached;
    }
    let category = "";
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      const res = await fetch(url, { method: "HEAD", signal: controller.signal });
      clearTimeout(timer);
      category = this.categoryFromContentType(
        res.headers.get("content-type") || "",
      );
    } catch {
      category = "";
    }
    this._urlTypeCache.set(url, category);
    return category;
  }

  getRenamedUri(uri: string, newName: string): string {
    const ext = this.getFileExtension(uri);
    const directory = this.getDirectoryUri(uri);
    return directory + "/" + newName + "." + ext;
  }

  findFiles(name: string, type: string): string[] {
    const matchingUris: string[] = [];
    for (const uri of this._watchedFiles.keys()) {
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

  textDocumentIsOpen(uri: string) {
    return this._openDocuments.has(uri);
  }

  protected async compilerReady() {
    await this.whenCompilerConfigured;
  }

  protected async projectLoaded() {
    if (!this._projectLoaded) {
      await this._projectLoading;
    }
  }

  protected async updateCompilerDocument(
    textDocument: { uri: string; version?: number },
    contentChanges: SparkdownDocumentContentChangeEvent[],
  ) {
    const posted = (async () => {
      await this.compilerReady();
      const configured = this._configuredDocumentVersions.get(
        textDocument.uri,
      );
      if (
        configured != null &&
        textDocument.version != null &&
        textDocument.version <= configured
      ) {
        return undefined;
      }
      this._configuredDocumentVersions.delete(textDocument.uri);
      const answer = this._compilerChannelConnection
        .sendRequest(UpdateCompilerDocumentMessage.type, {
          textDocument,
          contentChanges,
        })
        .catch((e) => {
          if (e instanceof CompilerRestartedError) {
            return undefined;
          }
          throw e;
        });
      return { answer };
    })();
    const update = posted.then((p) => p?.answer);
    this._documentUpdates = update.catch(() => {});
    this._documentUpdatesPosted = posted.then(
      () => {},
      () => {},
    );
    return update;
  }

  protected _documentUpdates: Promise<unknown> = Promise.resolve();

  protected _documentUpdatesPosted: Promise<void> = Promise.resolve();

  protected _programTransport = new ProgramTransportDecoder();

  protected _filesRevision = 0;
  get filesRevision() {
    return this._filesRevision;
  }

  protected _fileUpdates: Promise<unknown> = Promise.resolve();

  protected _fileUpdatesByUri = new Map<string, Promise<unknown>>();

  protected trackFileUpdate<T>(
    uri: string,
    update: () => Promise<T>,
  ): Promise<T> {
    this._filesRevision++;
    const previous = this._fileUpdatesByUri.get(uri);
    const done = previous ? previous.then(() => update()) : update();
    const settled = done.then(
      () => {},
      () => {},
    );
    this._fileUpdatesByUri.set(uri, settled);
    void settled.then(() => {
      if (this._fileUpdatesByUri.get(uri) === settled) {
        this._fileUpdatesByUri.delete(uri);
      }
    });
    this._fileUpdates = Promise.allSettled([this._fileUpdates, done]);
    return done;
  }

  async previewCompile(params: {
    textDocument: { uri: string; version: number };
    contentChanges: SparkdownDocumentContentChangeEvent[];
    startFrom: { file: string; line: number };
  }): Promise<PreviewCompileProgramResult> {
    const { textDocument } = params;
    const current = this._documentVersions.get(textDocument.uri);
    if (current != null && current !== textDocument.version) {
      return { textDocument, outdated: true };
    }
    await this._documentUpdates;
    await this._fileUpdates;
    await this.compilerReady();
    const root = this.getMainScriptUri(textDocument.uri) ?? textDocument.uri;
    profile("start", this._profilerId, "workspace" + " " + "previewCompile", root);
    try {
      const result = await this._compilerChannelConnection.sendRequest(
        PreviewCompileProgramMessage.type,
        { ...params, root: { uri: root } },
      );
      if (!result.program?.summary) {
        this._programTransport.decode(result.program);
      }
      return result;
    } finally {
      profile("end", this._profilerId, "workspace" + " " + "previewCompile", root);
    }
  }

  debouncedCompile = debounce(async (uri: string, force: boolean) => {
    return this.compile(uri, force);
  }, DEBOUNCE_DELAY);

  protected _changeCompileDebounceDelay = 50;
  protected debouncesFromEdit = false;
  protected _changeCompileTimer?: ReturnType<typeof setTimeout>;
  protected _changeCompileDeadline?: number;
  protected _pendingChangeCompileUris = new Set<string>();
  protected _changeCompileRunning = false;
  protected _changeCompileDue = false;
  protected _compilesInFlight = 0;

  protected scheduleChangeCompile(uri: string, changedAt?: number) {
    const delay = this._changeCompileDebounceDelay;
    this._pendingChangeCompileUris.add(uri);
    if (this._changeCompileDue) {
      return;
    }
    if (this._changeCompileTimer != null) {
      clearTimeout(this._changeCompileTimer);
      this._changeCompileTimer = undefined;
    }
    if (delay <= 0) {
      this.runChangeCompiles();
      return;
    }
    const now = Date.now();
    const elapsed =
      changedAt == null ? 0 : Math.min(delay, Math.max(0, now - changedAt));
    if (this._changeCompileDeadline == null) {
      this._changeCompileDeadline = now - elapsed + delay * 4;
    }
    const wait = Math.min(
      delay - elapsed,
      Math.max(0, this._changeCompileDeadline - now),
    );
    this._changeCompileTimer = setTimeout(() => {
      this._changeCompileTimer = undefined;
      this.runChangeCompiles();
    }, wait);
  }

  protected runChangeCompiles() {
    this._changeCompileDeadline = undefined;
    if (this._changeCompileRunning || this._compilesInFlight > 0) {
      this._changeCompileDue = true;
      return;
    }
    this._changeCompileDue = false;
    if (this._pendingChangeCompileUris.size === 0) {
      return;
    }
    this._changeCompileRunning = true;
    const pendingUris = Array.from(this._pendingChangeCompileUris);
    void (async () => {
      for (const pendingUri of pendingUris) {
        this._pendingChangeCompileUris.delete(pendingUri);
        try {
          await this.compile(pendingUri, false);
        } catch (e) {
          console.error(e);
        }
      }
    })().finally(() => {
      this._changeCompileRunning = false;
      if (this._changeCompileDue) {
        this.runChangeCompiles();
      }
    });
  }

  async compile(
    uri: string,
    force: boolean,
  ): Promise<SparkProgram | undefined> {
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
      const nextCompiledCallbacks = this._onNextCompiled.get(uri);
      if (nextCompiledCallbacks) {
        this._onNextCompiled.delete(uri);
        nextCompiledCallbacks.forEach((c) => c?.(state.program));
      }
      return state.program;
    }
    if (!force && this._pendingChangeCompileUris.has(uri)) {
      return new Promise((resolve) => {
        const nextCompiledCallbacks = this._onNextCompiled.get(uri) || [];
        nextCompiledCallbacks.push(resolve);
        this._onNextCompiled.set(uri, nextCompiledCallbacks);
      });
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
    profile("start", this._profilerId, "workspace" + " " + "compile", uri);
    this._compilesInFlight++;
    try {
      state.compilingDocumentVersion = this._documentVersions.get(uri);
      let result: CompileProgramResult | undefined = undefined;
      let programUnchanged = false;
      let storyUnchanged = false;
      const mainScriptUri = this.getMainScriptUri(uri);
      try {
        if (mainScriptUri) {
          const previousProgram = this.getProgramState(mainScriptUri).program;
          result = await this.compileDocument(mainScriptUri);
          programUnchanged = result.program === previousProgram;
          storyUnchanged = isSameProgram(result.program, previousProgram);
          this.getProgramState(mainScriptUri).program = result.program;
          if (result.program.scripts) {
            for (const [uri, version] of Object.entries(result.program.scripts)) {
              const state = this.getProgramState(uri);
              state.program = result.program;
              state.compilingDocumentVersion = undefined;
              state.compiledDocumentVersion = version;
              if (!programUnchanged) {
                state.version++;
              }
              this._onNextCompiled.get(uri)?.forEach((c) => c?.(result?.program));
              this._onNextCompiled.delete(uri);
            }
          }
        }
        if (uri !== mainScriptUri && result?.program?.scripts[uri] == null) {
          if (
            this.publishesStoryOfStandaloneCompiles &&
            mainScriptUri &&
            result?.program &&
            !storyUnchanged
          ) {
            this.publishCompiled(mainScriptUri, result, false);
          }
          const previousProgram = this.getProgramState(uri).program;
          result = await this.compileDocument(uri);
          programUnchanged = result.program === previousProgram;
          const state = this.getProgramState(uri);
          state.program = result.program;
          state.compilingDocumentVersion = undefined;
          state.compiledDocumentVersion = result.program?.scripts[uri];
          if (!programUnchanged) {
            state.version++;
          }
          this._onNextCompiled.get(uri)?.forEach((c) => c?.(result?.program));
          this._onNextCompiled.delete(uri);
        }
      } catch (e) {
        const flush = (flushUri: string) => {
          const callbacks = this._onNextCompiled.get(flushUri);
          if (callbacks) {
            this._onNextCompiled.delete(flushUri);
            callbacks.forEach((c) => c?.(undefined));
          }
        };
        flush(uri);
        if (mainScriptUri) {
          flush(mainScriptUri);
        }
        state.compilingDocumentVersion = undefined;
        if (e instanceof CompilerRestartedError) {
          return undefined;
        }
        throw e;
      }
      if (result?.program) {
        this.publishCompiled(uri, result, programUnchanged);
      }
      return result?.program;
    } finally {
      profile("end", this._profilerId, "workspace" + " " + "compile", uri);
      this._compilesInFlight--;
      if (
        this._changeCompileDue &&
        !this._changeCompileRunning &&
        this._compilesInFlight === 0
      ) {
        this.runChangeCompiles();
      }
    }
  }

  protected publishesStoryOfStandaloneCompiles = false;

  protected publishCompiled(
    uri: string,
    result: CompileProgramResult,
    programUnchanged: boolean,
  ) {
    const state = this.getProgramState(uri);
    if (!programUnchanged) {
      result.program.version = state.version;
    }
    const notificationParams: CompiledProgramParams = this
      .slimProgramNotifications
      ? {
          ...result,
          program: {
            uri: result.program.uri,
            scripts: result.program.scripts,
            files: {},
            version: result.program.version,
            playRefusal: playRefusalOf(result.program),
          },
          diagnosticsSummary: summarizeDiagnostics(result.program.diagnostics),
        }
      : result;
    this.sendNotification(CompiledProgramMessage.method, notificationParams);
    this.onCompiledTextDocument({
      textDocument: { uri },
      program: result.program,
    });
  }

  stripMarkdown(markdown: string): string {
    if (!markdown) return "";

    let output = markdown;

    output = output.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

    output = output.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

    output = output.replace(/^\s*>\s+/gm, "");

    output = output.replace(/^#{1,6}\s+(.*)$/gm, "$1");

    output = output.replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2");

    output = output.replace(/`(.+?)`/g, "'$1'");

    output = output.replace(/```([\s\S]*?)```/g, "$1");

    output = output.replace(/^([\s\t]*[\*\-\_]){3,}\s*$/gm, "");

    output = output.replace(/^[\s\t]*[\*\-\+]\s+/gm, "");
    output = output.replace(/^[\s\t]*\d+\.\s+/gm, "");

    return output.trim();
  }

  getDiagnostics(program: SparkProgram, uri: string) {
    const programDiagnostics = program.diagnostics?.[uri] || [];
    const diagnostics = this.clientCapabilities?.textDocument?.diagnostic
      ?.markupMessageSupport
      ? programDiagnostics
      : programDiagnostics.map((d) => {
          return {
            ...d,
            message:
              typeof d.message === "string"
                ? d.message
                : this.stripMarkdown(d.message.value),
          };
        });

    return diagnostics;
  }

  protected async compileDocument(uri: string) {
    await this.compilerReady();
    await this._documentUpdatesPosted;
    this._lastCompiledUri = uri;
    const startFrom = this.compileStartFrom();
    this._lastCompileStartFrom = startFrom;
    const result = await this._compilerChannelConnection.sendRequest(
      CompileProgramMessage.type,
      {
        textDocument: { uri },
        startFrom,
      },
    );
    if (!result.program?.summary) {
      this._programTransport.decode(result.program);
    }
    return result;
  }

  locatorOf(program: SparkProgram): AsyncProgramLocator {
    const ask = async (query: LocateQuery) => {
      try {
        const [answer] = await this._compilerChannelConnection.sendRequest(
          LocateProgramMessage.type,
          { program: program.uri, queries: [query] },
        );
        return answer ?? undefined;
      } catch (e) {
        unlessRestarted(e);
        return undefined;
      }
    };
    return {
      addressAt: async (uri, line, query) =>
        (await ask({ addressAt: { uri, line, query } })) as
          | ProgramAddress
          | undefined,
      locationOf: async (address) =>
        (await ask({ locationOf: address })) as SourceLocation | undefined,
      beatAt: async (uri, line, query) =>
        (await ask({ beatAt: { uri, line, query } })) as LineBeat | undefined,
    };
  }

  protected _lastCompileStartFrom?: { file: string; line: number };

  protected compileAnswersEditSelection(uri: string) {
    const version = this._documentVersions.get(uri);
    const state = this.getProgramState(uri);
    if (
      state.compilingDocumentVersion != null &&
      state.compilingDocumentVersion === version
    ) {
      const sent = this._lastCompileStartFrom;
      const now = this.compileStartFrom();
      return sent?.file === now?.file && sent?.line === now?.line;
    }
    if (state.compiledDocumentVersion === version) {
      return false;
    }
    return this._pendingChangeCompileUris.has(uri);
  }

  protected _selectionsReceived = 0;
  protected _pointSelectionPublished = 0;

  protected receiveSelection() {
    return ++this._selectionsReceived;
  }

  protected publishSelection(
    received: number,
    result: SelectCompilerDocumentResult,
    movesCompilePoint: boolean,
  ) {
    if (received < this._pointSelectionPublished) {
      return;
    }
    if (movesCompilePoint) {
      this._pointSelectionPublished = received;
    }
    this.sendNotification(SelectedCompilerDocumentMessage.method, result);
  }

  protected compileStartFrom() {
    return this._documentSelected;
  }

  protected movesCompilePoint(_params: { userEvent?: boolean }): boolean {
    return true;
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
    this._openDocuments.add(textDocument.uri);
    this._documentVersions.set(textDocument.uri, textDocument.version);
    this._configuredDocumentVersions.delete(textDocument.uri);
    if (this._mirrorDocumentTexts) {
      this._documentTexts.set(
        textDocument.uri,
        TextDocument.create(
          textDocument.uri,
          textDocument.languageId,
          textDocument.version,
          textDocument.text,
        ),
      );
    }
    this.updateCompilerDocument(textDocument, [
      { text: textDocument.text },
    ]).then(() => {
      this.debouncedCompile(textDocument.uri, false);
    });
    this.onOpenTextDocument(params);
  }

  async closeTextDocument(params: {
    textDocument: {
      uri: string;
    };
  }) {
    const textDocument = params.textDocument;
    this._openDocuments.delete(textDocument.uri);
    this.onCloseTextDocument(params);
  }

  async changeTextDocument(params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
    changedAt?: number;
  }) {
    const textDocument = params.textDocument;
    const contentChanges = params.contentChanges;
    this._documentVersions.set(textDocument.uri, textDocument.version);
    const mirrored = this._documentTexts.get(textDocument.uri);
    if (mirrored) {
      TextDocument.update(mirrored, contentChanges, textDocument.version);
    }
    this.updateCompilerDocument(textDocument, contentChanges).catch((e) =>
      console.error(e),
    );
    this.scheduleChangeCompile(
      textDocument.uri,
      this.debouncesFromEdit ? params.changedAt : undefined,
    );
    this.onChangeTextDocument(params);
  }

  async compileTextDocument(params: { textDocument: { uri: string } }) {
    const { textDocument } = params;
    this.compile(textDocument.uri, true);
  }

  async selectTextDocument(params: {
    textDocument: { uri: string };
    selectedRange: Range;
    docChanged: boolean;
    userEvent?: boolean;
  }) {
    const { textDocument, selectedRange } = params;
    const received = this.receiveSelection();
    const movesCompilePoint = this.movesCompilePoint(params);
    if (movesCompilePoint) {
      this._documentSelected = {
        file: textDocument.uri,
        line: selectedRange.start.line,
      };
    }
    if (
      movesCompilePoint &&
      params.docChanged &&
      this.compileAnswersEditSelection(textDocument.uri)
    ) {
      const result: SelectCompilerDocumentResult = {
        ...params,
        programOutdated: true,
      };
      this.publishSelection(received, result, movesCompilePoint);
      return result;
    }
    await this.compilerReady();
    let result: SelectCompilerDocumentResult;
    try {
      result = await this._compilerChannelConnection.sendRequest(
        SelectCompilerDocumentMessage.type,
        params,
      );
    } catch (e) {
      if (!(e instanceof CompilerRestartedError)) {
        throw e;
      }
      return { ...params };
    }
    this.publishSelection(received, result, movesCompilePoint);
    return result;
  }

  async createFile(uri: string) {
    const file = await this.trackFileUpdate(uri, async () => {
      await this.projectLoaded();
      if (this.getFileType(uri) === "script") {
        this._documentVersions.set(uri, 0);
      }
      this._configuredDocumentVersions.delete(uri);
      const file = await this.loadFile({ uri });
      this._watchedFiles.set(uri, file);
      this.onCreatedFile(file);
      await this.compilerReady();
      await this._compilerChannelConnection
        .sendRequest(AddCompilerFileMessage.type, {
          file: imageFileForCompiler(
            file,
            this._compilerConfig?.stripImageData,
          ),
        })
        .catch(unlessRestarted);
      return file;
    });
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
    return file;
  }

  protected changesFromFile(uri: string) {
    const type = this.getFileType(uri);
    return Boolean(type && (type !== "script" || !this._openDocuments.has(uri)));
  }

  async changeFile(uri: string) {
    if (this._projectLoaded && !this.changesFromFile(uri)) {
      return this._watchedFiles.get(uri);
    }
    const file = await this.trackFileUpdate(uri, async () => {
      if (!this._projectLoaded) {
        await this.projectLoaded();
        if (!this.changesFromFile(uri)) {
          return undefined;
        }
      }
      this._documentTexts.delete(uri);
      const file = await this.loadFile({ uri });
      this._watchedFiles.set(uri, file);
      this._documentVersions.set(uri, file.version ?? 0);
      this.onChangedFile(file);
      await this.compilerReady();
      await this._compilerChannelConnection
        .sendRequest(UpdateCompilerFileMessage.type, {
          file: imageFileForCompiler(
            file,
            this._compilerConfig?.stripImageData,
          ),
        })
        .catch(unlessRestarted);
      return file;
    });
    if (!file) {
      return this._watchedFiles.get(uri);
    }
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
    return file;
  }

  async deleteFile(uri: string) {
    const deletedFile = await this.trackFileUpdate(uri, async () => {
      await this.projectLoaded();
      const deletedFile = this._watchedFiles.get(uri);
      this._imageVocabularyCache.delete(uri);
      this._watchedFiles.delete(uri);
      this._programStates.delete(uri);
      this._documentVersions.delete(uri);
      this._documentTexts.delete(uri);
      this._configuredDocumentVersions.delete(uri);
      if (this._documentSelected?.file === uri) {
        this._documentSelected = undefined;
      }
      if (deletedFile) {
        this.onDeletedFile(deletedFile!);
      }
      await this.compilerReady();
      await this._compilerChannelConnection
        .sendRequest(RemoveCompilerFileMessage.type, {
          file: { uri },
        })
        .catch(unlessRestarted);
      return deletedFile;
    });
    if (
      this._lastCompiledUri &&
      this.textDocumentExists(this._lastCompiledUri)
    ) {
      await this.debouncedCompile(this._lastCompiledUri, true);
    }
    return deletedFile;
  }

  onOpenTextDocument(_params: {
    textDocument: {
      uri: string;
      languageId: string;
      version: number;
      text: string;
    };
  }) {}

  onCloseTextDocument(_params: {
    textDocument: {
      uri: string;
    };
  }) {}

  onChangeTextDocument(_params: {
    textDocument: {
      uri: string;
      version: number;
    };
    contentChanges: SparkdownDocumentContentChangeEvent[];
  }) {}

  onCompiledTextDocument(_params: {
    textDocument: { uri: string };
    program: SparkProgram;
  }) {}

  onDeletedFile(_file: File) {}

  onChangedFile(_file: File) {}

  onCreatedFile(_file: File) {}

  abstract sendRequest<P, M extends string, R>(
    method: M,
    params: P,
  ): Promise<R>;

  abstract sendNotification<P, M extends string>(
    method: M,
    params: P,
  ): Promise<void>;

  abstract getFileText(uri: string): Promise<string>;

  abstract getFileSrc(uri: string): Promise<string>;

  abstract getFileVersion(uri: string): Promise<number>;

  abstract getFileLanguageId(uri: string): Promise<string>;

  async getFileBytes(_uri: string): Promise<string | undefined> {
    return undefined;
  }
}
