import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import { SPARKDOWN_EMBEDDED_LANGUAGES } from "@impower/sparkdown/src/compiler/utils/sparkdownLanguageFor";
import {
  createLanguageReader,
  type LanguageReader,
} from "../../../packages/textmate-grammar-tree/src/tree/utils/createLanguageReader";
import * as vscode from "vscode";

export class SparkdownDocumentManager {
  private static _instance: SparkdownDocumentManager;
  static get instance(): SparkdownDocumentManager {
    if (!this._instance) {
      this._instance = new SparkdownDocumentManager();
    }
    return this._instance;
  }

  protected _documents: SparkdownDocumentRegistry;

  protected _languageReaders = new WeakMap<object, LanguageReader>();

  constructor() {
    this._documents = new SparkdownDocumentRegistry([
      "formatting",
      "declarations",
    ]);
    this._documents.profilerId = "editor";
  }

  add(document: vscode.TextDocument) {
    this._documents.add({
      textDocument: {
        uri: document.uri.toString(),
        languageId: document.languageId,
        version: document.version,
        text: document.getText(),
      },
    });
  }

  remove(document: vscode.TextDocument) {
    this._documents.remove({
      textDocument: {
        uri: document.uri.toString(),
      },
    });
  }

  update(changeEvent: vscode.TextDocumentChangeEvent) {
    this._documents.update({
      textDocument: {
        uri: changeEvent.document.uri.toString(),
        version: changeEvent.document.version,
      },
      contentChanges:
        changeEvent.contentChanges as vscode.TextDocumentContentChangeEvent[],
    });
  }

  all() {
    return this._documents.all();
  }

  get(uri: vscode.Uri) {
    return this._documents.get(uri.toString());
  }

  annotations(uri: vscode.Uri) {
    return this._documents.annotations(uri.toString());
  }

  tree(uri: vscode.Uri) {
    return this._documents.tree(uri.toString());
  }

  languageAt(document: vscode.TextDocument, position: vscode.Position): string {
    const uri = document.uri.toString();
    if (this._documents.get(uri)?.version !== document.version) {
      this.add(document);
    }
    const synced = this._documents.get(uri);
    const tree = this._documents.tree(uri);
    if (!synced || !tree) {
      return document.languageId;
    }
    const { grammar } = this._documents.parserFor(uri);
    let reader = this._languageReaders.get(grammar);
    if (!reader) {
      reader = createLanguageReader(grammar, SPARKDOWN_EMBEDDED_LANGUAGES);
      this._languageReaders.set(grammar, reader);
    }
    return reader.cursor(
      tree,
      {
        length: synced.length,
        sliceString: (from, to) => synced.read(from, to),
      },
      synced.offsetAt(position),
      document.languageId,
    );
  }
}
