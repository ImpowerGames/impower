import { ChangeSet, EditorSelection, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import type * as lsp from "vscode-languageserver-protocol";
import { LSPClient } from "./client";
import { LSPPlugin } from "./plugin";
import { getDocumentVersion } from "./version";

export interface WorkspaceFile {
  uri: string;
  languageId: string;
  version: number;
  doc: Text;
  getView(main?: EditorView): EditorView | null;
}

export interface WorkspaceFileUpdate {
  file: WorkspaceFile;
  prevDoc: Text;
  changes: ChangeSet;
}

export abstract class Workspace {
  abstract files: WorkspaceFile[];

  constructor(
    readonly client: LSPClient,
  ) {}

  getFile(uri: string): WorkspaceFile | null {
    return this.files.find((f) => f.uri == uri) || null;
  }

  abstract syncFiles(): readonly WorkspaceFileUpdate[];

  requestFile(uri: string): Promise<WorkspaceFile | null> {
    return Promise.resolve(this.getFile(uri));
  }

  abstract openFile(uri: string, languageId: string, view: EditorView): void;

  abstract closeFile(uri: string, view: EditorView): void;

  refreshFileContent(_uri: string, _text: string): void {}

  connected(_client: LSPClient): void {
    for (let file of this.files) this.client.didOpen(file);
  }

  disconnected(): void {}

  async updateFiles(
    params: {
      label?: string;
      edit: lsp.WorkspaceEdit;
      metadata?: { isRefactoring?: boolean };
    },
    userEvent: string,
  ): Promise<void> {
    const updates: Promise<void>[] = [];
    if (params.edit.documentChanges) {
      for (const c of params.edit.documentChanges) {
        if ("textDocument" in c) {
          const uri = c.textDocument.uri;
          const edits = c.edits.filter(
            (e): e is lsp.TextEdit | lsp.AnnotatedTextEdit => "newText" in e,
          );
          const file = this.getFile(uri);
          if (!edits.length || !file) {
            continue;
          }
          updates.push(this.updateFile(uri, edits, userEvent));
        }
      }
    } else if (params.edit.changes) {
      for (let [uri, edits] of Object.entries(params.edit.changes)) {
        const file = this.getFile(uri);
        if (!edits.length || !file) {
          continue;
        }
        updates.push(this.updateFile(uri, edits, userEvent));
      }
    }
    await Promise.all(updates);
  }

  async updateFile(
    uri: string,
    changes: lsp.TextEdit[],
    userEvent: string,
  ): Promise<void> {
    const file = this.getFile(uri);
    const view = file!.getView();
    if (!view) {
      throw new Error(`File is not open: ${file!.uri}`);
    }
    let plugin = LSPPlugin.get(view);
    plugin!.client.withMapping(async (mapping) => {
      const update = {
        changes: changes.map((change) => ({
          from: mapping.mapPosition(uri, change.range.start),
          to: mapping.mapPosition(uri, change.range.end),
          insert: change.newText,
        })),
        userEvent,
      };
      view.dispatch(update);
    });
  }

  async displayFile(
    params: {
      uri: string;
      selection?: lsp.Range;
      takeFocus?: boolean;
      external?: boolean;
    },
    userEvent: string,
  ): Promise<void> {
    const file = this.getFile(params.uri);
    const view = file!.getView();
    if (!view) {
      throw new Error(`File is not open: ${file!.uri}`);
    }
    if (params.takeFocus) {
      view.focus();
    }
    if (params.selection) {
      let plugin = LSPPlugin.get(view);
      plugin!.client.withMapping(async (mapping) => {
        const from = mapping.getMapping(params.uri)
          ? mapping.mapPosition(params.uri, params.selection!.start)
          : plugin!.fromPosition(params.selection!.start, view.state.doc);
        const to = mapping.getMapping(params.uri)
          ? mapping.mapPosition(params.uri, params.selection!.end)
          : plugin!.fromPosition(params.selection!.end, view.state.doc);
        if (params.takeFocus) {
          view.focus();
        }
        view.dispatch({
          selection: { anchor: from, head: to },
          effects: EditorView.scrollIntoView(EditorSelection.range(from, to), {
            y: "center",
          }),
          userEvent,
        });
      });
    }
  }

  async changeWatchedFiles(
    _params: lsp.DidChangeWatchedFilesParams,
  ): Promise<void> {}
}

class DefaultWorkspaceFile implements WorkspaceFile {
  constructor(
    readonly uri: string,
    readonly languageId: string,
    public version: number,
    public doc: Text,
    readonly view: EditorView,
  ) {}

  getView() {
    return this.view;
  }
}

export class DefaultWorkspace extends Workspace {
  files: DefaultWorkspaceFile[] = [];

  syncFiles() {
    let result: WorkspaceFileUpdate[] = [];
    for (let file of this.files) {
      let plugin = LSPPlugin.get(file.view);
      if (!plugin) continue;
      let changes = plugin.unsyncedChanges;
      if (!changes.empty) {
        result.push({ changes, file, prevDoc: file.doc });
        file.doc = file.view.state.doc;
        file.version = getDocumentVersion(file.view.state);
        plugin.clear();
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    if (this.getFile(uri))
      throw new Error(
        "Default workspace implementation doesn't support multiple views on the same file",
      );
    let file = new DefaultWorkspaceFile(
      uri,
      languageId,
      getDocumentVersion(view.state),
      view.state.doc,
      view,
    );
    this.files.push(file);
    this.client.didOpen(file);
  }

  closeFile(uri: string) {
    let file = this.getFile(uri);
    if (file) {
      this.files = this.files.filter((f) => f != file);
      this.client.didClose(uri);
    }
  }
}
