import { SparkdownDocumentRegistry } from "@impower/sparkdown/src/compiler/classes/SparkdownDocumentRegistry";
import * as vscode from "vscode";

export class SparkdownDocumentManager {
  private static _instance: SparkdownDocumentManager;
  static get instance(): SparkdownDocumentManager {
    if (!this._instance) {
      this._instance = new SparkdownDocumentManager();
    }
    return this._instance;
  }

  protected _documents = new SparkdownDocumentRegistry("editor", [
    "formatting",
    "declarations",
  ]);

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
}
