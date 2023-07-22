import {
  CancellationToken,
  Connection,
  DidChangeTextDocumentParams,
  DidChangeWatchedFilesParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Disposable,
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

import {
  ParseTextDocument,
  ParseTextDocumentParams,
} from "@impower/spark-editor-protocol/src/protocols/textDocument/messages/ParseTextDocument";
import { SparkProgram } from "@impower/sparkdown/src/types/SparkProgram";

import { EditorSparkParser } from "./EditorSparkParser";

export const IMAGE_FILE_EXTENSIONS = [
  "png",
  "apng",
  "jpeg",
  "jpg",
  "gif",
  "svg",
  "bmp",
];
export const AUDIO_FILE_EXTENSIONS = ["wav", "mp3", "mp4", "ogg"];
export const SCRIPT_FILE_EXTENSIONS = ["sd", "spark", "sparkdown"];

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

  protected readonly _syncedPackages: Record<
    string,
    {
      files: Record<
        string,
        {
          name: string;
          src: string;
          ext: string;
          type: string;
        }
      >;
    }
  > = {};

  protected readonly _syncedPrograms = new Map<string, SparkProgram>();

  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _parser: EditorSparkParser;

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._parser = new EditorSparkParser();
  }

  getDirectoryUri(uri: string): string {
    return uri.split("/").slice(0, -1).join("/");
  }

  getFileName(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[0]!;
  }

  getFileUrl(uri: string): string {
    return uri;
  }

  getFileType(uri: string): string {
    const ext = this.getFileExtension(uri);
    if (IMAGE_FILE_EXTENSIONS.includes(ext)) {
      return "image";
    }
    if (AUDIO_FILE_EXTENSIONS.includes(ext)) {
      return "audio";
    }
    if (SCRIPT_FILE_EXTENSIONS.includes(ext)) {
      return "script";
    }
    return "text";
  }

  getFileExtension(uri: string): string {
    return uri.split("/").slice(-1).join("").split(".")[1]!;
  }

  addFileToPackage(packageUri: string, fileUri: string) {
    const packageManifest = this._syncedPackages[packageUri];
    if (packageManifest) {
      const name = this.getFileName(fileUri);
      const src = this.getFileUrl(fileUri);
      const type = this.getFileType(fileUri);
      const ext = this.getFileExtension(fileUri);
      packageManifest.files[fileUri] = { name, src, type, ext };
    }
  }

  removeFileFromPackage(packageUri: string, fileUri: string) {
    const packageManifest = this._syncedPackages[packageUri];
    if (packageManifest) {
      delete packageManifest.files[fileUri];
    }
  }

  loadPackages(packages: { uri: string; files: { uri: string }[] }[]) {
    packages.forEach((p) => {
      this._syncedPackages[p.uri] = { files: {} };
      p.files.forEach((f) => {
        if (!f.uri.endsWith("package.sd")) {
          this.addFileToPackage(p.uri, f.uri);
        }
      });
    });
  }

  getPackageUris(fileUri: string): string[] {
    return Object.keys(this._syncedPackages).filter((uri) =>
      fileUri.startsWith(this.getDirectoryUri(uri))
    );
  }

  getClosestPackageUri(fileUri: string): string {
    let closestPackageUri = "";
    let closestDirectoryUri = "";
    Object.keys(this._syncedPackages).forEach((packageUri) => {
      const directoryUri = this.getDirectoryUri(packageUri);
      if (
        fileUri.startsWith(directoryUri) &&
        directoryUri.length > closestDirectoryUri.length
      ) {
        closestDirectoryUri = directoryUri;
        closestPackageUri = packageUri;
      }
    });
    return closestPackageUri;
  }

  parse(uri: string) {
    const syncedDocument = this.__syncedDocuments.get(uri);
    if (syncedDocument) {
      const packageUri = this.getClosestPackageUri(uri);
      const files = Object.values(
        this._syncedPackages[packageUri]?.files || {}
      );
      const syncedProgram = this._parser.parse(syncedDocument.getText(), {
        files,
      });
      this._syncedPrograms.set(uri, syncedProgram);
      this._onDidParse.fire(
        Object.freeze({
          document: syncedDocument,
          program: syncedProgram,
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
    if (fileUri.endsWith("package.sd")) {
      this._syncedPackages[fileUri] = { files: {} };
      // TODO: send readFiles request to client to populate files list
    } else {
      const packageUris = this.getPackageUris(fileUri);
      packageUris.forEach((packageUri) => {
        this.addFileToPackage(packageUri, fileUri);
      });
    }
  }

  onDeletedFile(fileUri: string) {
    if (this._syncedPackages[fileUri]) {
      delete this._syncedPackages[fileUri];
    } else {
      const packageUris = this.getPackageUris(fileUri);
      packageUris.forEach((packageUri) => {
        this.removeFileFromPackage(packageUri, fileUri);
      });
    }
  }

  public override listen(connection: Connection): Disposable {
    (<ConnectionState>(<any>connection)).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
    disposables.push(
      connection.onRequest(
        ParseTextDocument.method,
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
              this.parse(td.uri);
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
