import { ChangeSet, EditorSelection, Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import * as lsp from "vscode-languageserver-protocol";
import { LSPClient } from "./client";
import { LSPPlugin } from "./plugin";
import { getDocumentVersion } from "./version";

/// A file that is open in a workspace.
export interface WorkspaceFile {
  /// The file's unique URI.
  uri: string;
  /// The LSP language ID for the file's content.
  languageId: string;
  /// The current version of the file.
  version: number;
  /// The document corresponding to `this.version`. Will not reflect
  /// changes made after that version was synchronized. Will be
  /// updated, along with `version`, by
  /// [`syncFiles`](#lsp-client.Workspace.syncFiles).
  doc: Text;
  /// Get an active editor view for this file, if there is one. For
  /// workspaces that support multiple views on a file, `main`
  /// indicates a preferred view.
  getView(main?: EditorView): EditorView | null;
}

export interface WorkspaceFileUpdate {
  file: WorkspaceFile;
  prevDoc: Text;
  changes: ChangeSet;
}

/// Implementing your own workspace class can provide more control
/// over the way files are loaded and managed when interacting with
/// the language server. See
/// [`LSPClientConfig.workspace`](#lsp-client.LSPClientConfig.workspace).
export abstract class Workspace {
  /// The files currently open in the workspace.
  abstract files: WorkspaceFile[];

  /// The constructor, as called by the client when creating a
  /// workspace.
  constructor(
    /// The LSP client associated with this workspace.
    readonly client: LSPClient,
  ) {}

  /// Find the open file with the given URI, if it exists. The default
  /// implementation just looks it up in `this.files`.
  getFile(uri: string): WorkspaceFile | null {
    return this.files.find((f) => f.uri == uri) || null;
  }

  /// Check all open files for changes (usually from editors, but they
  /// may also come from other sources). When a file is changed,
  /// return a record that describes the changes, and update the file's
  /// [`version`](#lsp-client.WorkspaceFile.version) and
  /// [`doc`](#lsp-client.WorkspaceFile.doc) properties to reflect the
  /// new version.
  abstract syncFiles(): readonly WorkspaceFileUpdate[];

  /// Called to request that the workspace open a file. The default
  /// implementation simply returns the file if it is open, null
  /// otherwise.
  requestFile(uri: string): Promise<WorkspaceFile | null> {
    return Promise.resolve(this.getFile(uri));
  }

  /// Called when an editor is created for a file. The implementation
  /// should track the file in
  /// [`this.files`](#lsp-client.Workspace.files) and, if it wasn't
  /// open already, call
  /// [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen).
  abstract openFile(uri: string, languageId: string, view: EditorView): void;

  /// Called when an editor holding this file is destroyed or
  /// reconfigured to no longer hold it. The implementation should
  /// track this and, when it closes the file, make sure to call
  /// [`LSPClient.didClose`](#lsp-client.LSPClient.didClose).
  abstract closeFile(uri: string, view: EditorView): void;

  /// Called when the server has changed the content of a closed text file.
  /// The default implementation does nothing when closed files are changed.
  refreshFileContent(uri: string, text: string): void {}

  /// Called when the client for this workspace is connected. The
  /// default implementation calls
  /// [`LSPClient.didOpen`](#lsp-client.LSPClient.didOpen) on all open
  /// files.
  connected(client: LSPClient): void {
    for (let file of this.files) this.client.didOpen(file);
  }

  /// Called when the client for this workspace is disconnected. The
  /// default implementation does nothing.
  disconnected(): void {}

  /// Called when a server-initiated change to workspace files are applied.
  /// The default implementation simply dispatches the update to the
  /// file's view, if the file is open and has a view.
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
          const edits = c.edits;
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

  /// Called when a server-initiated change to a file is applied. The
  /// default implementation simply dispatches the update to the
  /// file's view, if the file is open and has a view.
  async updateFile(
    uri: string,
    changes: lsp.TextEdit[],
    userEvent: string,
  ): Promise<void> {
    const file = this.getFile(uri);
    const view = file.getView();
    if (!view) {
      throw new Error(`File is not open: ${file.uri}`);
    }
    let plugin = LSPPlugin.get(view);
    plugin.client.withMapping(async (mapping) => {
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

  /// When the client needs to put a file other than the one loaded in
  /// the current editor in front of the user, for example in
  /// [`jumpToDefinition`](#lsp-client.jumpToDefinition), it will call
  /// this function. It should make sure to create or find an editor
  /// with the file and make it visible to the user, or return null if
  /// this isn't possible.
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
    const view = file.getView();
    if (!view) {
      throw new Error(`File is not open: ${file.uri}`);
    }
    if (params.takeFocus) {
      view.focus();
    }
    if (params.selection) {
      let plugin = LSPPlugin.get(view);
      plugin.client.withMapping(async (mapping) => {
        const from = mapping.getMapping(params.uri)
          ? mapping.mapPosition(params.uri, params.selection.start)
          : plugin.fromPosition(params.selection.start, view.state.doc);
        const to = mapping.getMapping(params.uri)
          ? mapping.mapPosition(params.uri, params.selection.end)
          : plugin.fromPosition(params.selection.end, view.state.doc);
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
    params: lsp.DidChangeWatchedFilesParams,
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
