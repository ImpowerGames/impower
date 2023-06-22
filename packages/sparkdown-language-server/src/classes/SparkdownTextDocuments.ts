import {
  CancellationToken,
  DidChangeTextDocumentParams,
  DidCloseTextDocumentParams,
  DidOpenTextDocumentParams,
  DidSaveTextDocumentParams,
  Disposable,
  Emitter,
  RequestHandler,
  TextDocumentSyncKind,
  TextEdit,
  WillSaveTextDocumentParams,
} from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  ConnectionState,
  TextDocumentChangeEvent,
  TextDocumentConnection,
  TextDocumentWillSaveEvent,
  TextDocuments,
  TextDocumentsConfiguration,
} from "vscode-languageserver/lib/common/textDocuments";
import { SparkProgram } from "../../../sparkdown/src/types/SparkProgram";
import { EditorSparkParser } from "./EditorSparkParser";

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

  protected readonly _syncedPrograms = new Map<string, SparkProgram>();

  protected readonly _onDidParse: Emitter<SparkProgramChangeEvent<T>>;

  protected readonly _parser: EditorSparkParser;

  public constructor(configuration: TextDocumentsConfiguration<T>) {
    super(configuration);
    this._onDidParse = new Emitter<SparkProgramChangeEvent<T>>();
    this._parser = new EditorSparkParser();
  }
  /**
   * An event that fires when a text document has been parsed
   */
  public get onDidParse() {
    return this._onDidParse.event;
  }
  /**
   * Returns the sparkdown program for the given URI.
   * Returns undefined if the document is not managed by this instance.
   *
   * @param uri The text document's URI to retrieve.
   * @return the text document's sparkdown program or `undefined`.
   */
  public program(uri: string): SparkProgram | undefined {
    return this._syncedPrograms.get(uri);
  }

  public override listen(connection: TextDocumentConnection): Disposable {
    (<ConnectionState>(<any>connection)).__textDocumentSync =
      TextDocumentSyncKind.Incremental;
    const disposables: Disposable[] = [];
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
        this.__onDidChangeContent.fire(toFire);
        const syncedProgram = this._parser.parse(td.text);
        this._syncedPrograms.set(td.uri, syncedProgram);
        if (document && syncedProgram) {
          this._onDidParse.fire(
            Object.freeze({ document, program: syncedProgram })
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
              if (syncedDocument) {
                const syncedProgram = this._parser.parse(
                  syncedDocument.getText()
                );
                this._syncedPrograms.set(td.uri, syncedProgram);
                this._onDidParse.fire(
                  Object.freeze({
                    document: syncedDocument,
                    program: syncedProgram,
                  })
                );
              }
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
    return Disposable.create(() => {
      disposables.forEach((disposable) => disposable.dispose());
    });
  }
}
