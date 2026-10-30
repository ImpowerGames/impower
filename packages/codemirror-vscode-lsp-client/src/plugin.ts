import { language } from "@codemirror/language";
import { ChangeSet, Extension, Text } from "@codemirror/state";
import {
  EditorView,
  ViewPlugin,
  ViewUpdate,
  showDialog,
} from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { type LSPClient } from "./client";
import { convertFromPosition, convertToPosition } from "./pos";
import { docToHTML, withContext } from "./text";

export class LSPPlugin {
  client: LSPClient;
  uri: string;

  constructor(
    readonly view: EditorView,
    {
      client,
      uri,
      languageID,
    }: { client: LSPClient; uri: string; languageID?: string },
  ) {
    this.client = client;
    this.uri = uri;
    if (!languageID) {
      let lang = view.state.facet(language);
      languageID = lang ? lang.name : "";
    }
    client.workspace.openFile(uri, languageID, view);
    this.syncedDoc = view.state.doc;
    this.unsyncedChanges = ChangeSet.empty(view.state.doc.length);
  }

  docToHTML(
    value: string | lsp.MarkupContent,
    defaultKind: lsp.MarkupKind = "plaintext",
  ) {
    let html = withContext(
      this.view,
      this.client.config.highlightLanguage,
      () => docToHTML(value, defaultKind),
    );
    return this.client.config.sanitizeHTML
      ? this.client.config.sanitizeHTML(html)
      : html;
  }

  toPosition(pos: number, doc: Text = this.view.state.doc) {
    return convertToPosition(doc, pos);
  }

  fromPosition(pos: lsp.Position, doc: Text = this.view.state.doc) {
    return convertFromPosition(doc, pos);
  }

  reportError(message: string, err: any) {
    showDialog(this.view, {
      label: this.view.state.phrase(message) + ": " + (err.message || err),
      class: "cm-lsp-message cm-lsp-message-error",
      top: true,
    });
  }

  syncedDoc: Text;

  unsyncedChanges: ChangeSet;

  clear() {
    this.syncedDoc = this.view.state.doc;
    this.unsyncedChanges = ChangeSet.empty(this.view.state.doc.length);
  }

  update(update: ViewUpdate) {
    if (update.docChanged)
      this.unsyncedChanges = this.unsyncedChanges.compose(update.changes);
  }

  destroy() {
    this.client.workspace.closeFile(this.uri, this.view);
  }

  static get(view: EditorView) {
    return view.plugin(lspPlugin);
  }

  static create(
    client: LSPClient,
    fileURI: string,
    languageID?: string,
  ): Extension {
    return client.plugin({ uri: fileURI, version: 0 }, languageID);
  }
}

export const lspPlugin = ViewPlugin.fromClass(LSPPlugin);
