import {
  DidChangeFileUrlMessage,
  DidChangeFileUrlParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeFileUrlMessage.js";
import {
  DidWatchFilesMessage,
  DidWatchFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import { DEFAULT_BUILTINS } from "@impower/spark-engine/src/game/modules/DEFAULT_BUILTINS";
import { DEFAULT_MODULES } from "@impower/spark-engine/src/game/modules/DEFAULT_MODULES";
import compile from "@impower/spark-evaluate/src/utils/compile";
import format from "@impower/spark-evaluate/src/utils/format";
import SparkParser from "@impower/sparkdown/src/classes/SparkParser";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
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
import debounce from "../utils/debounce";
import getDocumentDiagnostics from "../utils/getDocumentDiagnostics";
import throttle from "../utils/throttle";

const PARSE_THROTTLE_DELAY = 100;

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

  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _onUpdateDiagnostics: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _parser: SparkParser;

  protected readonly _builtins = DEFAULT_BUILTINS;

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
      builtins: this._builtins,
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

  loadFiles(
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
      this.parse(this.getMainScriptUri(), true);
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

  debouncedParse = debounce((uri: string) => {
    this.parse(uri, true);
  }, PARSE_THROTTLE_DELAY);

  throttledParse = throttle((uri: string) => {
    this.parse(uri);
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
      let entryDocument = mainDocument;
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
          entryDocument = targetDocument;
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

  onCreatedFile(fileUri: string) {
    const name = this.getFileName(fileUri);
    const type = this.getFileType(fileUri);
    const ext = this.getFileExtension(fileUri);
    const src = this._urls[fileUri] || fileUri;
    this._files.set(fileUri, {
      uri: fileUri,
      name,
      type,
      ext,
      src,
    });
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
        (params: DidChangeFileUrlParams) => {
          const uri = params.uri;
          const src = params.src;
          this._urls[uri] = src;
          const existingFile = this._files.get(uri);
          if (existingFile) {
            existingFile.src = src;
          }
          const type = this.getFileType(uri);
          if (type !== "script") {
            // When asset url changes, reparse all programs so that asset srcs are up-to-date.
            this.debouncedParse(this.getMainScriptUri());
          }
        }
      )
    );
    disposables.push(
      connection.onNotification(
        DidWatchFilesMessage.method,
        (params: DidWatchFilesParams) => {
          const files = params.files;
          files.forEach((file) => {
            const fileUri = file.uri;
            const text = file.text;
            const name = this.getFileName(fileUri);
            const type = this.getFileType(fileUri);
            const ext = this.getFileExtension(fileUri);
            const src = this._urls[fileUri] || fileUri;
            this._files.set(fileUri, {
              uri: fileUri,
              name,
              type,
              ext,
              text,
              src,
            });
          });
          this.debouncedParse(this.getMainScriptUri());
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
              this.throttledParse(td.uri);
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
