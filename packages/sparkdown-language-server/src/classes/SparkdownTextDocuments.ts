import {
  ParseTextDocumentMessage,
  ParseTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/ParseTextDocumentMessage.js";
import {
  DidWatchFilesMessage,
  DidWatchFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import { STRUCT_DEFAULTS } from "@impower/spark-engine/src/parser/constants/STRUCT_DEFAULTS";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";
import { SparkVariable } from "@impower/sparkdown/src/types/SparkVariable";
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
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { ConnectionState } from "vscode-languageserver/lib/common/textDocuments";
import getDocumentDiagnostics from "../utils/getDocumentDiagnostics";
import throttle from "../utils/throttle";
import { EditorSparkParser } from "./EditorSparkParser";

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

  protected readonly _files: Record<
    string,
    {
      uri: string;
      name: string;
      src: string;
      ext: string;
      type: string;
    }
  > = {};

  protected readonly _syncedPrograms = new Map<string, SparkProgram>();

  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _parser: EditorSparkParser;

  protected _scriptFilePattern?: RegExp;

  protected _imageFilePattern?: RegExp;

  protected _audioFilePattern?: RegExp;

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._parser = new EditorSparkParser();
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
  }

  getDirectoryUri(uri: string): string {
    return uri.split("/").slice(0, -1).join("/");
  }

  getFileName(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[0]!;
  }

  getFileType(uri: string): string {
    if (this._imageFilePattern?.test(uri)) {
      return "image";
    }
    if (this._audioFilePattern?.test(uri)) {
      return "audio";
    }
    if (this._scriptFilePattern?.test(uri)) {
      return "script";
    }
    return "text";
  }

  getFileExtension(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[1]!;
  }

  throttledParse = throttle((uri: string) => {
    this.parse(uri);
  }, PARSE_THROTTLE_DELAY);

  parse(uri: string) {
    const syncedDocument = this.__syncedDocuments.get(uri);
    if (syncedDocument) {
      const syncedProgram = this._syncedPrograms.get(uri);
      if (syncedDocument.version === syncedProgram?.version) {
        return syncedProgram;
      }
      const files = Object.values(this._files);
      const variables: Record<string, SparkVariable> = {};
      files.forEach((file) => {
        if (file.name) {
          const obj = {
            uri: file.uri,
            name: file.name,
            src: file.src,
            ext: file.ext,
            type: file.type,
          };
          variables[file.type + "." + file.name] ??= {
            tag: "asset",
            line: -1,
            from: -1,
            to: -1,
            indent: 0,
            type: file.type,
            name: file.name,
            value: JSON.stringify(obj),
            compiled: obj,
            implicit: true,
          };
        }
      });
      const newSyncedProgram = this._parser.parse(syncedDocument.getText(), {
        augmentations: { builtins: STRUCT_DEFAULTS, variables },
      });
      newSyncedProgram.version = syncedDocument.version;
      this._syncedPrograms.set(uri, newSyncedProgram);
      this._onDidParse.fire(
        Object.freeze({
          document: syncedDocument,
          program: newSyncedProgram,
        })
      );
    }
    return this._syncedPrograms.get(uri);
  }

  /**
   * Returns the sparkdown program for the given URI.
   * Returns undefined if the document is not managed by this instance.
   *
   * @param uri The text document's URI to retrieve.
   * @return the text document's sparkdown program or `undefined`.
   */
  public program(uri: string): SparkProgram | undefined {
    const existingProgram = this._syncedPrograms.get(uri);
    if (existingProgram) {
      return existingProgram;
    }
    return this.parse(uri);
  }

  onCreatedFile(fileUri: string) {
    const name = this.getFileName(fileUri);
    const type = this.getFileType(fileUri);
    const ext = this.getFileExtension(fileUri);
    this._files[fileUri] = {
      uri: fileUri,
      name,
      type,
      ext,
      src: fileUri,
    };
  }

  onDeletedFile(fileUri: string) {
    delete this._files[fileUri];
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
          const program = this.program(uri);
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
        DidWatchFilesMessage.method,
        (params: DidWatchFilesParams) => {
          const files = params.files;
          files.forEach((file) => {
            const fileUri = file.uri;
            const name = this.getFileName(fileUri);
            const type = this.getFileType(fileUri);
            const ext = this.getFileExtension(fileUri);
            this._files[fileUri] = {
              uri: fileUri,
              name,
              type,
              ext,
              src: fileUri,
            };
          });
        }
      )
    );
    disposables.push(
      connection.onRequest(
        ParseTextDocumentMessage.method,
        (params: ParseTextDocumentParams) => {
          const uri = params.textDocument.uri;
          return this.parse(uri);
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
        this.parse(td.uri);
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
          this.__syncedDocuments.delete(event.textDocument.uri);
          this.__onDidClose.fire(Object.freeze({ document: syncedDocument }));
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
