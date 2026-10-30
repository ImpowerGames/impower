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

/**
 * Roll program diagnostics up into per-file severity counts (LSP severities:
 * 1=Error, 2=Warning, 3=Information, 4=Hint — hints count as infos). Used by
 * the slim `compiler/didCompile` relay so file badges/colors don't require
 * shipping the diagnostics themselves.
 */
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

/** What a request still waiting on the compiler's worker is settled with
 *  when the worker is terminated and another started in its place
 *  (`restartCompiler`). */
export class CompilerRestartedError extends Error {
  override name = "CompilerRestartedError";
  constructor() {
    super("The compiler's worker was restarted before it answered");
  }
}

/** Settle a request quietly when the worker it went to was restarted: the
 *  restarted one was given the project as the page holds it. */
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
    /** Present when the client asks for code actions; a client that does not
     *  gets a diagnostic's quick fixes in its `data`. */
    codeAction?: object;
  };
}

export abstract class SparkdownWorkspace {
  protected _compilerChannelConnection!: Port1MessageConnection;

  protected _compilerInlineWorkerContent: string;

  protected _compilerWorkerUrl?: string;

  protected _compilerWorker?: Worker;

  /** Keep the text of every open document as the editor last sent it
   *  (`_documentTexts`), which the compiler's worker otherwise holds alone,
   *  so a worker started in place of one that stopped answering can be given
   *  it (`restartCompiler`). A workspace that never restarts its worker
   *  leaves this off. */
  protected _mirrorDocumentTexts = false;

  protected _documentTexts = new Map<string, TextDocument>();

  /** The version of each document the files a restarted compiler was
   *  configured with carry, so an update to it that was already folded into
   *  them is not applied again. An entry goes once an update past it has
   *  been sent, and when the document is opened, created or deleted, since a
   *  document opened again can start its versions over. */
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

  /** Memoized HEAD-probed media category per remote URL (`""` = unresolvable). */
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

  /**
   * When enabled, the `compiler/didCompile` notification relays a SLIM
   * projection of the program (uri/scripts/files/version) instead of the
   * whole thing. On a large project the full program is huge (~9MB for an
   * ~8kloc script) and re-broadcast on EVERY compile — the receiving thread
   * pays a structured-clone deserialization of all of it per keystroke. The
   * impower web editor's main thread only ever reads diagnostics
   * (WorkspaceWindow debug store) and scripts, and asks the language server
   * for the PreviewGame's PageUp/PageDown source navigation, so it opts in via
   * initializationOptions. Defaults to false: the vscode extension consumes
   * the full program from this notification (SparkProgramManager).
   */
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

  /**
   * Resolves once `configureCompiler` has completed — i.e. the compiler worker
   * has its document registry and can actually compile.
   *
   * Requests that arrive before then used to fail hard with "Compiler has not
   * been configured!" (the `documents` getter throws), which on a large project
   * meant semantic tokens / code lenses erroring for as long as initialization
   * took, with no retry. Compiles now wait for this instead.
   *
   * Pending from construction, so a request that arrives before `initialize()`
   * waits for the configuration `initialize` starts as well. Both hosts send
   * `initialize` first thing, but the editor forwards file events to the
   * language server as they happen, and on a large project some arrive before
   * it (#1817).
   */
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

  /**
   * Whether `initialize()` has registered the project's files. A file event
   * that arrives before then moves the files revision at once but records
   * its change only after them (`projectLoaded`), since the files
   * `initialize` is given would otherwise overwrite it: a file deleted early
   * would come back. Each event is applied once, in the order it arrived.
   */
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

  /** Start the compiler's worker and connect to it. */
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

  /**
   * Terminate the compiler's worker and start another in its place, given
   * the project as the editor holds it now: every file, with the text of
   * each open document as the editor last sent it. The new worker compiles
   * the document compiled last, routing where a compile routes
   * (`compileStartFrom`).
   *
   * Everything the old worker held goes with it, its warm compile state
   * included, so the compile this runs is a cold one. Every request still
   * waiting on it is settled with a {@link CompilerRestartedError}, after
   * `onCompilerRestarted` has connected whatever talks to the worker to the
   * new one (#679).
   */
  async restartCompiler(): Promise<void> {
    const previous = this._compilerChannelConnection;
    this._compilerWorker?.terminate();
    this._initializedCompiler = false;
    this._compilerConfigured = false;
    // Whoever waits for the old worker's configuration, which will not come
    // now, waits for the new one's instead.
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
      // Never configured, so there is nothing to give the new worker yet:
      // `initialize` configures it when it comes, which settles the wait.
      return;
    }
    try {
      await this.loadCompiler({
        ...config,
        files: this.currentCompilerFiles(),
        startFrom: this.compileStartFrom(),
      });
    } catch (e) {
      // Restarted again before this worker was configured: the newer
      // restart configures and compiles in its place.
      unlessRestarted(e);
      return;
    }
    const uri = this._lastCompiledUri;
    if (uri) {
      await this.compile(uri, true);
    }
  }

  /** Every file of the project for the compiler's configuration, with the
   *  text of each document the editor has sent it, and the version each of
   *  those carries noted, as the restarted compiler holds them. */
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

  /** Called once a restarted compiler's worker has been connected, before
   *  the requests waiting on the old one are settled. */
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
      // Even when loading failed, so the file events waiting for it are not
      // held forever.
      this.markProjectLoaded();
      if (!this._compilerConfig) {
        // Nothing began configuring the compiler (no initialization options,
        // or loading failed before it got that far), and nothing will: let
        // what waits for its configuration reach it and hear its error,
        // rather than wait forever.
        this._resolveCompilerConfigured?.();
      }
    }
  }

  protected async loadProject(
    params: Parameters<SparkdownWorkspace["initialize"]>[0],
  ): ReturnType<SparkdownWorkspace["initialize"]> {
    if (params.initializationOptions) {
      // (slimProgramNotifications/compileDebounceDelay must be destructured
      // out so they don't fall through into compilerConfig.)
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
              // Remote/CDN `.url` assets infer their type/ext from the URL text.
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
      // Configure the compiler and run the first compile OFF the initialize
      // response path. Nothing the client renders first needs them: compiler
      // requests wait on `whenCompilerConfigured`, results arrive through
      // publishDiagnostics/didCompile, and the post-initialize refreshes
      // re-request anything asked for too early (#224). Awaiting this wall
      // here kept the editor invisible for the entire multi-second
      // parse+configure+compile chain on large projects (#285).
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
    // The compiler leaves a folder that holds a main script of its own out
    // of the project above it, by the name this workspace gives main scripts.
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
      // Settle even on failure: a waiter blocking forever would be worse than
      // the original error surfacing at the compile site. Only for the worker
      // it configured, though: a configure the worker's restart abandoned
      // says nothing about the worker started in its place (#679).
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

  /**
   * A `.url` file is a remote/CDN asset reference (see
   * docs/file-manager/url-assets-plan.md): its text content IS the remote URL,
   * and its media type is inferred from that URL's own extension rather than
   * the `.url` extension. Returns the inferred `{ type, ext }`, or `null` when
   * this isn't a resolvable `.url` file. Mirrors the resolution performed in
   * opfs-workspace `updateFileCache` so the editor and compiler agree on the
   * asset's identity. Type/ext are inferred from the URL's path only (query and
   * hash stripped) so signed URLs don't false-match on a token.
   */
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
    // No extension in the URL path (a bare CDN URL): ask the server for the
    // media type via a HEAD probe and map its Content-Type.
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

  /** Map a `Content-Type` header to a media category (`""` if none matches). */
  protected categoryFromContentType(contentType: string): string {
    const t = (contentType.split(";")[0] || "").trim().toLowerCase();
    if (t.startsWith("image/")) return "image";
    if (t.startsWith("audio/")) return "audio";
    if (t.startsWith("video/")) return "video";
    if (t.startsWith("font/") || t.includes("font")) return "font";
    if (t.startsWith("text/")) return "text";
    return "";
  }

  /**
   * Resolve a remote URL's media category from a HEAD request's `Content-Type`,
   * memoized per URL. Bounded by a 4s timeout; swallows all errors (CORS,
   * network, timeout) and caches `""` so an unresolvable URL is probed once.
   * Mirrors opfs-workspace `resolveUrlTypeViaHead` so editor and compiler agree.
   */
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
    // `_watchedFiles` is a Map — `Object.keys` on it is always empty, which had
    // silently made every findFiles() return [] (so asset file-renames + the
    // asset branch of getReferences never matched). Iterate the Map's keys.
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

  textDocumentIsOpen(uri: string) {
    return this._openDocuments.has(uri);
  }

  /**
   * Wait (if necessary) for the compiler worker to be configured before
   * talking to it. Since initialize() no longer blocks on configuration,
   * document/file traffic can otherwise race ahead of ConfigureCompiler and
   * be silently clobbered by its files snapshot.
   */
  protected async compilerReady() {
    await this.whenCompilerConfigured;
  }

  /** Wait (if necessary) for `initialize()` to register the project's files
   *  before a file event records its change (`_projectLoaded`). */
  protected async projectLoaded() {
    if (!this._projectLoaded) {
      await this._projectLoading;
    }
  }

  protected async updateCompilerDocument(
    textDocument: { uri: string; version?: number },
    contentChanges: SparkdownDocumentContentChangeEvent[],
  ) {
    // Settles once the request is posted, with its answer still to come
    // (wrapped, so awaiting the post does not await the answer).
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
        // A restarted compiler was configured with this change already.
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
            // The worker it was sent to is gone; the restarted one was given
            // the document's text as the editor holds it.
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

  // Settles once every document update sent so far has reached the compiler,
  // so a request that must see them (a preview compile) can wait for them.
  protected _documentUpdates: Promise<unknown> = Promise.resolve();

  // Settles once every document update so far has been posted to the
  // compiler. The compiler answers requests in the order they were posted, so
  // a compile posted after this has settled sees those updates, without
  // waiting for the compiler to answer them (#1881).
  protected _documentUpdatesPosted: Promise<void> = Promise.resolve();

  // Pairs with the encoder in the compiler worker. Every program response is
  // decoded as soon as it arrives, in the order it arrives, except a summary,
  // which the worker does not encode.
  protected _programTransport = new ProgramTransportDecoder();

  protected _filesRevision = 0;
  /** Increases whenever a project file is created, changed or deleted, so a
   *  result computed against the files as they were can be recognized. */
  get filesRevision() {
    return this._filesRevision;
  }

  // Settles once every project file change begun so far has reached the
  // compiler. A preview compile waits for it, so one asked for after the
  // revision above moved compiles against the files that moved it.
  protected _fileUpdates: Promise<unknown> = Promise.resolve();

  // The last change still in progress for each project file.
  protected _fileUpdatesByUri = new Map<string, Promise<unknown>>();

  /** Record a change to the project file `uri`: move the revision at once,
   *  and run `update`, which loads the file and hands it to the compiler, as
   *  a change preview compiles wait for. `update` starts once the changes to
   *  the same file recorded before it have finished, so a slow create cannot
   *  land after the delete that followed it; changes to different files run
   *  side by side. */
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

  /**
   * Compile the program as it would be with `contentChanges` applied to
   * `textDocument`, without applying them (see
   * `SparkdownCompiler.previewCompile`). Nothing about the result is recorded
   * here, and no notification announces it: it belongs to the caller alone.
   *
   * Waits for the document updates sent before it, since the edit is relative
   * to the version they bring the document to. Answers `outdated` at once when
   * that version is already behind.
   */
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

  // Trailing debounce for keystroke-driven compiles. Running one compile per
  // keystroke saturates the compiler worker with results that are stale on
  // arrival; waiting for a pause in typing costs only the delay. The max-wait
  // keeps diagnostics/preview converging during sustained typing instead of
  // freezing until the first pause. The default, 50 ms, was chosen by
  // measurement for the player's preview compiles (#1797): typing at 80 to
  // 120 ms a key on a long script, it is the shortest delay whose results are
  // no more often stale on arrival than at 200 ms. The language-server hosts
  // use it too since their slim relay stopped carrying the program's files
  // table (#1815). A host can override it (`compileDebounceDelay` on
  // initialize); 0 compiles at every keystroke, still one compile at a time.
  protected _changeCompileDebounceDelay = 50;
  // Whether the debounce counts from when the editor says it made the edit
  // (`changedAt`) rather than from its arrival. Off here: the language
  // server's diagnostics keep their own pace, and a compile of theirs started
  // as early as the preview's competes with it for the machine. The player
  // turns it on (#1881).
  protected debouncesFromEdit = false;
  protected _changeCompileTimer?: ReturnType<typeof setTimeout>;
  protected _changeCompileDeadline?: number;
  // EVERY document with a pending debounced compile. A multi-file change
  // burst (find-and-replace, Save All, a workspace edit) can touch documents
  // in DIFFERENT compile trees (a standalone script, a second main.sd tree);
  // keeping only the latest uri silently dropped the earlier ones' compiles,
  // stranding their piggybacked waiters and leaving their diagnostics stale.
  protected _pendingChangeCompileUris = new Set<string>();
  // The worker runs one keystroke compile at a time. A delay shorter than a
  // compile lets the timer fire while the last batch, or any other compile, is
  // still running; the batch it would start then waits, and runs as soon as
  // nothing is compiling, with the text as it is by then.
  protected _changeCompileRunning = false;
  protected _changeCompileDue = false;
  protected _compilesInFlight = 0;

  /** Schedule the keystroke compile for an edit to `uri`, made at
   *  `changedAt` (by `Date.now()`) when the editor says when. The debounce
   *  runs from then: the editor's own work on the key can hold its message
   *  back by more than the debounce (#1881). The time since the edit counts
   *  for no more than the debounce and no less than nothing, so what is left
   *  to wait is between nothing and the whole debounce. That assumes the
   *  editor's clock agrees with this one, as on one machine: a clock behind
   *  this one makes the edit look old and the compile start at once, and one
   *  ahead makes it wait the whole debounce, never longer. */
  protected scheduleChangeCompile(uri: string, changedAt?: number) {
    const delay = this._changeCompileDebounceDelay;
    this._pendingChangeCompileUris.add(uri);
    if (this._changeCompileDue) {
      // The debounce already ran out; the batch starts when the compile in
      // flight returns, and compiles this keystroke's text too.
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
    // Timed even when nothing is left to wait, so the selection the editor
    // sent after the edit is usually handled before the compile is sent; one
    // handled after it is answered by it when it routes there
    // (`compileAnswersEditSelection`).
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
      // Compile each pending document in order. Documents covered by an
      // earlier compile in this batch hit the no-change early-return (which
      // also flushes their waiters), so same-tree batches still cost one
      // compile; only genuinely separate trees pay for their own.
      for (const pendingUri of pendingUris) {
        // Taken off the pending set only now: a keystroke to it while an
        // earlier document of the batch compiled is covered by this compile,
        // which would otherwise wait on a batch that cannot start until this
        // one ends.
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
      // Flush any waiters queued behind a compile that ended up unnecessary
      // (e.g. a forced compile already covered their version).
      const nextCompiledCallbacks = this._onNextCompiled.get(uri);
      if (nextCompiledCallbacks) {
        this._onNextCompiled.delete(uri);
        nextCompiledCallbacks.forEach((c) => c?.(state.program));
      }
      return state.program;
    }
    if (!force && this._pendingChangeCompileUris.has(uri)) {
      // A debounced keystroke compile for this document is already scheduled;
      // piggyback on it instead of racing it with a second full compile.
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
    // Start the phase only once the cheap exits above are behind us. The
    // no-change and piggyback returns do no compile work — one of them just
    // waits on somebody else's compile — so measuring them under this name
    // would fold queue time into the metric and understate what a compile
    // actually costs. The `finally` is what the ticket is about: the body
    // below rethrows, and a bare trailing call would drop that measurement.
    profile("start", this._profilerId, "workspace" + " " + "compile", uri);
    this._compilesInFlight++;
    try {
      state.compilingDocumentVersion = this._documentVersions.get(uri);
      let result: CompileProgramResult | undefined = undefined;
      // When the compiler's no-change short-circuit serves its cached program,
      // it returns the SAME object as last time. Bumping our version counter on
      // that would advertise a "new" program that is bit-identical -- and the
      // player rebuilds its whole Game whenever program.version changes -- so
      // detect identity and keep the version stable.
      let programUnchanged = false;
      // Whether the story compile served the program it served before, by
      // the fields that survive the trip from the compiler: a host given
      // summaries, as the player is, gets a new object for every answer.
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
            // The story changed, and the result below replaces it. One the
            // compile served again is not published: the page would take it
            // as a new program, and restart PLAY for it.
            this.publishCompiled(mainScriptUri, result, false);
          }
          // Target script is not included by main,
          // So it must be parsed on its own to report diagnostics
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
        // Settle instead of strand: piggybacked callers (pull diagnostics etc.)
        // are awaiting these resolvers, and a compile failure must not turn
        // their requests into permanent hangs.
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
          // The worker it was sent to is gone; the restarted one compiles
          // the project again (`restartCompiler`).
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
        // A keystroke batch waited for this compile.
        this.runChangeCompiles();
      }
    }
  }

  /**
   * Whether a compile of a script the story does not include also publishes
   * the story's program, when the story changed. Such a compile compiles the
   * story first and publishes only the script's own program, so a host that
   * shows the story would otherwise never hear of the new one. Off here, as
   * the language server needs only the script's; the player turns it on.
   */
  protected publishesStoryOfStandaloneCompiles = false;

  /** Stamp `result`'s program with `uri`'s version, unless the compile
   *  served the program before, and publish it. */
  protected publishCompiled(
    uri: string,
    result: CompileProgramResult,
    programUnchanged: boolean,
  ) {
    const state = this.getProgramState(uri);
    if (!programUnchanged) {
      result.program.version = state.version;
    }
    // With slimProgramNotifications, relay only what the notification's
    // consumers actually read instead of the whole program (which is ~9MB on
    // a large project and re-broadcast on EVERY compile; the receiver pays a
    // structured-clone of all of it per keystroke).
    //
    // The impower web editor's main thread needs just `diagnosticsSummary`
    // (file/tab error+warning colors). Everything else is fetched on demand
    // or delivered through a dedicated channel:
    //   - full diagnostics    → textDocument/publishDiagnostics
    //   - prev/next beat      → sparkdown/offsetSourceLocation
    // uri/scripts/version ride along because they're small and identify
    // the compile. `files` is NOT small: it describes every asset of the
    // project and measured 5.8 MB of JSON on a real one, which cost the
    // editor a ~40 ms clone per compile result for a field nothing there
    // reads (#1815). Resist adding heavy fields back here — prefer an
    // on-demand request.
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

    // Remove Images: ![alt](url) -> alt
    output = output.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");

    // Remove Links: [text](url) -> text
    output = output.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1");

    // Remove Blockquotes: > quote -> quote
    output = output.replace(/^\s*>\s+/gm, "");

    // Remove Headers: # Header -> Header
    output = output.replace(/^#{1,6}\s+(.*)$/gm, "$1");

    // Remove Bold/Italic: **text**, __text__, *text*, _text_
    output = output.replace(/([\*_]{1,3})(\S.*?\S{0,1})\1/g, "$2");

    // Remove Inline Code: `code` -> 'code'
    output = output.replace(/`(.+?)`/g, "'$1'");

    // Remove Code Blocks: ```code``` -> code
    output = output.replace(/```([\s\S]*?)```/g, "$1");

    // Remove Horizontal Rules: ---, ***, ___
    output = output.replace(/^([\s\t]*[\*\-\_]){3,}\s*$/gm, "");

    // Remove List Bullets: * item, - item, + item, 1. item -> item
    output = output.replace(/^[\s\t]*[\*\-\+]\s+/gm, "");
    output = output.replace(/^[\s\t]*\d+\.\s+/gm, "");

    // Final trim to clean up leading/trailing whitespace
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
    // Wait out initialization rather than throwing "Compiler has not been
    // configured!" at whoever asked first (see `whenCompilerConfigured`).
    await this.compilerReady();
    // Posted after the document updates sent before it, which the compiler
    // then applies first.
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

  /**
   * The accessor of a program this workspace received (`ProgramLocator`),
   * answered by the compiler's worker from the last program it compiled for
   * the same uri (`LocateProgramMessage`). The copy a compile hands the
   * workspace leaves the statement chunks' root behind, and a program is
   * located by its root. An answer the worker's restart abandoned is none.
   */
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

  /** Where the compile sent last routes the preview to. */
  protected _lastCompileStartFrom?: { file: string; line: number };

  /** Whether the edit to `uri` the editor has just sent a selection after
   *  is answered by a compile that publishes a program for the document's
   *  current version and routes to the point compiles route to now: one sent
   *  for that version that routes there, or one still to be sent. The timer
   *  that sends a compile can fire before the selection the editor sent after
   *  the edit is handled. A version already compiled, by a forced compile
   *  say, gets no compile from the timer, which finds nothing changed. */
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

  // The selections in the order they arrived, and the last one moving the
  // compile point whose answer was published. An answer is published only
  // when no later such selection's has been: one the compiler answers can
  // come back after a later one the workspace answered at once, and the page
  // takes each of the author's as the author's current point (#1881). A
  // selection that does not move the point, which the page does not take,
  // supersedes nothing.
  protected _selectionsReceived = 0;
  protected _pointSelectionPublished = 0;

  /** Number a selection as it arrives, for `publishSelection`. */
  protected receiveSelection() {
    return ++this._selectionsReceived;
  }

  /** Tell the page of the answer to selection `received`, unless the answer
   *  to a later selection that moved the compile point has been published
   *  already. */
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

  /** Where a compile routes the preview to: the author's selection. */
  protected compileStartFrom() {
    return this._documentSelected;
  }

  /** Whether a selection moves the point compiles route to
   *  (`compileStartFrom`). Every selection does here; a host whose preview
   *  follows only some of them narrows it. */
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
    /** When the editor made the change, by `Date.now()`, if it says. */
    changedAt?: number;
  }) {
    const textDocument = params.textDocument;
    const contentChanges = params.contentChanges;
    this._documentVersions.set(textDocument.uri, textDocument.version);
    const mirrored = this._documentTexts.get(textDocument.uri);
    if (mirrored) {
      TextDocument.update(mirrored, contentChanges, textDocument.version);
    }
    // The compile is scheduled now, not once the compiler has answered the
    // update: it is posted after the update (`compileDocument`), and the
    // compiler applies the update first (#1881).
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
      // The selection an edit left, which the edit's compile routes to
      // (`compileStartFrom`) and answers when it lands (#1881). Sent to the
      // compiler, it would be handled ahead of a compile still to be sent,
      // which would wait for it, and could only learn that the program it
      // routes against is outdated; or after one already sent, when it would
      // route to the point again and have the page display it a second time.
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
      // The worker it was sent to is gone. The restarted one routes to the
      // selection as it compiles (`restartCompiler`), and the page hears of
      // it from that compile.
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

  /** Whether a change to the file at `uri` is the file's to apply: an asset
   *  or an unopened script. An open script's text comes from its document. */
  protected changesFromFile(uri: string) {
    const type = this.getFileType(uri);
    return Boolean(type && (type !== "script" || !this._openDocuments.has(uri)));
  }

  async changeFile(uri: string) {
    if (this._projectLoaded && !this.changesFromFile(uri)) {
      return this._watchedFiles.get(uri);
    }
    const file = await this.trackFileUpdate(uri, async () => {
      // What kind of file it is depends on the settings `initialize` brings,
      // so a change that arrived before then is told apart only now.
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

  /**
   * Read a file's raw bytes as base64, for hosts where the file's `src` isn't
   * fetchable from this worker (VS Code). Deliberately NOT abstract: hosts
   * that serve their assets over http never need it, and returning undefined
   * degrades to the non-composited preview rather than breaking them.
   */
  async getFileBytes(_uri: string): Promise<string | undefined> {
    return undefined;
  }
}
