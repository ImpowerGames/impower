import { Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  LSPClient,
  LSPPlugin,
  Workspace,
  WorkspaceFile,
  getDocumentVersion,
} from "@impower/codemirror-vscode-lsp-client/src";
import { WorkspaceFileUpdate } from "@impower/codemirror-vscode-lsp-client/src/workspace";
import { InitializeResult } from "@impower/spark-editor-protocol/src/protocols/InitializeMessage";
import type * as lsp from "vscode-languageserver-protocol";

interface FileHandler {
  showDocument: (params: {
    uri: string;
    selection?: lsp.Range;
    takeFocus?: boolean;
    external?: boolean;
  }) => Promise<void>;
  applyWorkspaceEdit: (params: {
    label?: string;
    edit: lsp.WorkspaceEdit;
    metadata?: { isRefactoring?: boolean };
  }) => Promise<void>;
  onWillApplyWorkspaceEdit?: () => void;
  onDidApplyWorkspaceEdit?: () => void;
}

const NEWLINE_REGEX = /\r\n|\r\n/g;

const LANGUAGE_ID = "sparkdown";

export class SparkdownCodemirrorWorkspace extends Workspace {
  override get files() {
    return Array.from(this._fileRegistry.values());
  }

  protected _fileRegistry = new Map<string, WorkspaceFile>();

  protected _openFiles = new Map<string, WorkspaceFile>();

  protected _fileHandler: FileHandler;

  constructor(client: LSPClient, fileHandler: FileHandler) {
    super(client);
    this._fileHandler = fileHandler;
  }

  override connected(client: LSPClient): void {
    for (let file of this._openFiles.values()) {
      this.client.didOpen(file);
    }
    const initializeResult = client.initializeResult as InitializeResult;
    if (initializeResult.textDocuments) {
      for (const file of initializeResult.textDocuments) {
        if (!this._fileRegistry.get(file.uri)) {
          // Add unopened workspace file to registry
          const text = file.text;
          const lines = text.replace(NEWLINE_REGEX, "\n").split("\n");
          this._fileRegistry.set(file.uri, {
            uri: file.uri,
            version: file.version ?? -1,
            languageId: file.languageId ?? LANGUAGE_ID,
            doc: Text.of(lines),
            getView: () => null,
          });
        }
      }
    }
  }

  override disconnected(): void {}

  syncFiles() {
    let result: WorkspaceFileUpdate[] = [];
    for (let file of this._openFiles.values()) {
      const view = file.getView();
      if (view) {
        let plugin = LSPPlugin.get(view);
        if (!plugin) {
          continue;
        }
        let changes = plugin.unsyncedChanges;
        if (!changes.empty) {
          result.push({ changes, file, prevDoc: file.doc });
          file.doc = view.state.doc;
          file.version = getDocumentVersion(view.state);
          plugin.clear();
        }
      }
    }
    return result;
  }

  openFile(uri: string, languageId: string, view: EditorView) {
    const file: WorkspaceFile = {
      uri,
      languageId,
      version: getDocumentVersion(view.state),
      doc: view.state.doc,
      getView: () => view,
    };
    this._fileRegistry.set(uri, file);
    this._openFiles.set(uri, file);
    this.client.didOpen(file);
  }

  closeFile(uri: string) {
    const file = this.getFile(uri);
    if (file) {
      file.getView = () => null;
      this._openFiles.delete(uri);
      this.client.didClose(uri);
    }
  }

  override refreshFileContent(uri: string, text: string) {
    const lines = text.replace(NEWLINE_REGEX, "\n").split("\n");
    const newDoc = Text.of(lines);
    // Update existing file or create one if it doesn't exist
    const existingFile = this._fileRegistry.get(uri);
    if (!existingFile) {
      this._fileRegistry.set(uri, {
        uri,
        version: -1,
        languageId: LANGUAGE_ID,
        doc: newDoc,
        getView: () => null,
      });
    } else if (!existingFile.getView()) {
      existingFile.version = -1;
      existingFile.doc = newDoc;
    }
  }

  override getFile(uri: string): WorkspaceFile | null {
    return this._fileRegistry.get(uri) ?? null;
  }

  override async requestFile(uri: string): Promise<WorkspaceFile | null> {
    return this.getFile(uri);
  }

  isOpen(uri: string) {
    const file = this._fileRegistry.get(uri);
    const view = file?.getView();
    return Boolean(view);
  }

  override async displayFile(
    params: {
      uri: string;
      selection: lsp.Range;
      takeFocus: boolean;
    },
    userEvent: string,
  ): Promise<void> {
    if (this.isOpen(params.uri)) {
      await super.displayFile(params, userEvent);
    } else {
      await this._fileHandler.showDocument(params);
    }
  }

  override async updateFiles(
    params: {
      label?: string;
      edit: lsp.WorkspaceEdit;
      metadata?: { isRefactoring?: boolean };
    },
    userEvent: string,
  ): Promise<void> {
    const openFilesDocumentChanges: (
      | lsp.TextDocumentEdit
      | lsp.CreateFile
      | lsp.RenameFile
      | lsp.DeleteFile
    )[] = [];
    const closedFilesDocumentChanges: (
      | lsp.TextDocumentEdit
      | lsp.CreateFile
      | lsp.RenameFile
      | lsp.DeleteFile
    )[] = [];
    const openFilesChanges: Record<string, lsp.TextEdit[]> = {};
    const closedFilesChanges: Record<string, lsp.TextEdit[]> = {};

    if (params.edit.documentChanges) {
      for (const c of params.edit.documentChanges) {
        if ("kind" in c || !this.isOpen(c.textDocument.uri)) {
          closedFilesDocumentChanges.push(c);
        } else {
          openFilesDocumentChanges.push(c);
        }
      }
    } else if (params.edit.changes) {
      for (const [uri, edits] of Object.entries(params.edit.changes)) {
        if (!this.isOpen(uri)) {
          closedFilesChanges[uri] = edits;
        } else {
          openFilesChanges[uri] = edits;
        }
      }
    }

    const openFilesEdit = {
      documentChanges: openFilesDocumentChanges,
      changes: openFilesChanges,
      changeAnnotations: params.edit.changeAnnotations,
    };
    const closedFilesEdit = {
      documentChanges: closedFilesDocumentChanges,
      changes: closedFilesChanges,
      changeAnnotations: params.edit.changeAnnotations,
    };

    this._fileHandler.onWillApplyWorkspaceEdit?.();

    await this._fileHandler.applyWorkspaceEdit({
      label: params.label,
      edit: closedFilesEdit,
      metadata: params.metadata,
    });

    await super.updateFiles(
      {
        label: params.label,
        edit: openFilesEdit,
        metadata: params.metadata,
      },
      userEvent,
    );

    this._fileHandler.onDidApplyWorkspaceEdit?.();
  }
}
