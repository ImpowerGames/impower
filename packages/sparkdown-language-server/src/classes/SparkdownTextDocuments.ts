import {
  DidChangeFileUrlMessage,
  DidChangeFileUrlParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeFileUrlMessage.js";
import {
  DidWatchFilesMessage,
  DidWatchFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import SparkParser from "../../../sparkdown/src/classes/SparkParser";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
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
import { debounce } from "../utils/timing/debounce";
import { getDocumentDiagnostics } from "../utils/providers/getDocumentDiagnostics";

const PARSE_THROTTLE_DELAY = 300;

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
  public get onDidParse() {
    return this._onDidParse.event;
  }

  /**
   * An event that fires when a text document has been parsed
   */
  public get onUpdateDiagnostics() {
    return this._onUpdateDiagnostics.event;
  }

  protected _urls: Record<string, string> = {};

  protected _files = new Map<
    string,
    {
      uri: string;
      name: string;
      src: string;
      ext: string;
      type: string;
      text?: string;
    }
  >();

  protected _parsedVersions = new Map<string, number>();

  protected _program?: SparkProgram;
  get program() {
    return this._program;
  }

  protected readonly _parser: SparkParser;
  get parser() {
    return this._parser;
  }

  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _onUpdateDiagnostics: Emitter<SparkProgramChangeEvent<T>>;

  protected _builtinDefinitions?: { [type: string]: { [name: string]: any } };
  get builtinDefinitions() {
    return this._builtinDefinitions;
  }

  protected _optionalDefinitions?: { [type: string]: { [name: string]: any } };
  get optionalDefinitions() {
    return this._optionalDefinitions;
  }

  protected _schemaDefinitions?: { [type: string]: { [name: string]: any } };
  get schemaDefinitions() {
    return this._schemaDefinitions;
  }

  protected _descriptionDefinitions?: {
    [type: string]: { [name: string]: any };
  };
  get descriptionDefinitions() {
    return this._descriptionDefinitions;
  }

  protected _workspaceFolders?: WorkspaceFolder[];

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  protected _fontFilePattern?: RegExp;

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._onUpdateDiagnostics = new Emitter<SparkProgramChangeEvent<T>>();
    this._parser = new SparkParser({
      resolveFile: (path: string) => this.resolveFile(path),
      readFile: (uri: string) => this.readFile(uri),
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

  loadBuiltinDefinitions(defs: { [type: string]: { [name: string]: any } }) {
    this._builtinDefinitions = defs;
    this._parser.configure({ builtinDefinitions: defs });
  }

  loadOptionalDefinitions(defs: { [type: string]: { [name: string]: any } }) {
    this._optionalDefinitions = defs;
    this._parser.configure({ optionalDefinitions: defs });
  }

  loadSchemaDefinitions(defs: { [type: string]: { [name: string]: any } }) {
    this._schemaDefinitions = defs;
    this._parser.configure({ schemaDefinitions: defs });
  }

  loadDescriptionDefinitions(defs: {
    [type: string]: { [name: string]: any };
  }) {
    this._descriptionDefinitions = defs;
  }

  async loadFiles(
    files: Record<
      string,
      {
        uri: string;
        name: string;
        src: string;
        ext: string;
        type: string;
        text?: string;
      }
    >
  ) {
    if (files) {
      const fileEntries = Object.entries(files);
      fileEntries.forEach(([uri, file]) => {
        this._files.set(uri, file);
      });
      await Promise.all(
        fileEntries.map(([, file]) => this.cacheFile(file.uri, file.src))
      );
      this._parser.configure({ files: this.getFiles() });
      fileEntries.forEach(([uri, file]) => {
        const text = file.text;
        if (file.type === "script" && text) {
          if (!this.__syncedDocuments.get(uri)) {
            const language = "sparkdown";
            const version = 0;
            const document = this.__configuration.create(
              uri,
              language,
              version,
              text
            );
            this.__syncedDocuments.set(uri, document);
          }
        }
      });
    }
  }

  resolveFile(path: string) {
    const p = path.trim();
    const suffix = p.endsWith(".script") ? "" : ".script";
    const name = p + suffix;
    const uri = this._workspaceFolders?.[0]?.uri + "/" + name;
    if (!this.__syncedDocuments.get(uri) && name !== "main.script") {
      throw new Error(`Cannot find file '${uri}'.`);
    }
    return uri;
  }

  readFile(uri: string) {
    const syncedDocument = this.__syncedDocuments.get(uri);
    if (syncedDocument) {
      return syncedDocument.getText();
    }
    const file = this._files.get(uri);
    if (file) {
      return file.text || "";
    }
    return "";
  }

  getMainScriptUri() {
    return this.resolveFile("main.script");
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

  debouncedParse = debounce((uri: string, force: boolean) => {
    this.parse(uri, force);
  }, PARSE_THROTTLE_DELAY);

  getFiles(): {
    [type: string]: {
      [name: string]: {
        uri: string;
        name: string;
        src: string;
        ext: string;
        type: string;
        text?: string;
      };
    };
  } {
    const files: {
      [type: string]: {
        [name: string]: {
          uri: string;
          name: string;
          src: string;
          ext: string;
          type: string;
          text?: string;
        };
      };
    } = {};
    this._files.forEach((file) => {
      if (file.name) {
        files[file.type] ??= {};
        files[file.type]![file.name] = {
          ...file,
        };
      }
    });
    return files;
  }

  parse(uri: string, force = false) {
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
    if (force || docChanged) {
      const targetDocument = this.__syncedDocuments.get(uri);
      const mainDocument = this.__syncedDocuments.get(this.getMainScriptUri());
      if (mainDocument) {
        this._program = this.parseDocument(mainDocument);
      }
      if (
        targetDocument?.uri !== mainDocument?.uri &&
        !this._program?.sourceMap?.[uri]
      ) {
        // Target script is not included by main,
        // So it must be parsed on its own to report diagnostics
        if (targetDocument) {
          this._program = this.parseDocument(targetDocument);
        }
      }
      if (targetDocument && this._program) {
        this._onDidParse.fire(
          Object.freeze({
            document: targetDocument,
            program: this._program,
          })
        );
        this._onUpdateDiagnostics.fire(
          Object.freeze({
            document: targetDocument,
            program: this._program,
          })
        );
      }
    }
    return this._program;
  }

  parseDocument(document: TextDocument) {
    const filename = this.getFilenameWithExtension(document.uri);
    const program = this._parser.parse(filename);
    return program;
  }

  getLatestTree(uri: string) {
    return this._parser.trees.get(uri);
  }

  async load(src: string) {
    try {
      return await (await fetch(src)).text();
    } catch {}
    return undefined;
  }

  async cacheFile(uri: string, src: string) {
    const name = this.getFileName(uri);
    const type = this.getFileType(uri);
    const ext = this.getFileExtension(uri);
    const text =
      src && (type === "script" || type === "text" || ext === "svg")
        ? await this.load(src)
        : undefined;
    const file = {
      uri,
      name,
      type,
      ext,
      src: src || uri,
      text,
    };
    this._files.set(uri, file);
    return file;
  }

  async onCreatedFile(fileUri: string) {
    await this.cacheFile(fileUri, this._urls[fileUri] || "");
    this._parser.configure({ files: this.getFiles() });
  }

  onDeletedFile(fileUri: string) {
    this._files.delete(fileUri);
    this.__syncedDocuments.delete(fileUri);
    this._parser.configure({ files: this.getFiles() });
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
          const program = this.program;
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
          const file = await this.cacheFile(uri, src);
          this._parser.configure({ files: this.getFiles() });
          if (file.type !== "script") {
            // When asset url changes, reparse all programs so that asset srcs are up-to-date.
            this.debouncedParse(this.getMainScriptUri(), true);
          }
        }
      )
    );
    disposables.push(
      connection.onNotification(
        DidWatchFilesMessage.method,
        async (params: DidWatchFilesParams) => {
          const files = params.files;
          await Promise.all(
            files.map((file) =>
              this.cacheFile(file.uri, this._urls[file.uri] || "")
            )
          );
          this._parser.configure({ files: this.getFiles() });
          this.debouncedParse(this.getMainScriptUri(), true);
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
        this.parse(td.uri, true);
        if (this._program) {
          this._onUpdateDiagnostics.fire(
            Object.freeze({
              document: document,
              program: this._program,
            })
          );
        }
      })
    );
    disposables.push(
      connection.onDidChangeTextDocument(
        (event: DidChangeTextDocumentParams) => {
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
              this.debouncedParse(td.uri, false);
            }
          }
        }
      )
    );
    disposables.push(
      connection.onDidCloseTextDocument((event: DidCloseTextDocumentParams) => {
        let syncedDocument = this.__syncedDocuments.get(event.textDocument.uri);
        if (syncedDocument !== undefined) {
          this.__onDidClose.fire(Object.freeze({ document: syncedDocument }));
        }
        const mainDocument = this.__syncedDocuments.get(
          this.getMainScriptUri()
        );
        if (mainDocument) {
          this.parse(mainDocument.uri, true);
          if (this._program) {
            this._onUpdateDiagnostics.fire(
              Object.freeze({
                document: mainDocument,
                program: this._program,
              })
            );
          }
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
