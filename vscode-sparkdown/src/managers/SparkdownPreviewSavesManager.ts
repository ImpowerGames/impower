import type { PreviewSave } from "@impower/spark-editor-protocol/src/protocols/preview/ListSavesMessage";
import {
  PreviewSaveStore,
  type PreviewSaveFiles,
} from "@impower/spark-editor-protocol/src/utils/PreviewSaveStore";
import * as vscode from "vscode";

const PREVIEW_SAVES_DIRECTORY = "preview-saves";

const WORKSPACE_SAVES = "workspace";

export const workspaceStorageSaveFiles = (
  storageUri: vscode.Uri | undefined,
): PreviewSaveFiles => ({
  async read(name) {
    if (!storageUri) {
      return null;
    }
    try {
      const bytes = await vscode.workspace.fs.readFile(
        vscode.Uri.joinPath(storageUri, PREVIEW_SAVES_DIRECTORY, name),
      );
      return new TextDecoder().decode(bytes);
    } catch (e) {
      if ((e as { code?: unknown })?.code === "FileNotFound") {
        return null;
      }
      throw e;
    }
  },
  async write(name, text) {
    if (!storageUri) {
      throw new Error("Saves are kept only while a folder is open.");
    }
    const directory = vscode.Uri.joinPath(storageUri, PREVIEW_SAVES_DIRECTORY);
    await vscode.workspace.fs.createDirectory(directory);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(directory, name),
      new TextEncoder().encode(text),
    );
  },
});

export class SparkdownPreviewSavesManager {
  private static _instance: SparkdownPreviewSavesManager;
  static get instance(): SparkdownPreviewSavesManager {
    if (!this._instance) {
      this._instance = new SparkdownPreviewSavesManager();
    }
    return this._instance;
  }

  protected _store?: PreviewSaveStore;

  activate(context: vscode.ExtensionContext) {
    this._store = new PreviewSaveStore(
      workspaceStorageSaveFiles(context.storageUri),
    );
  }

  protected get store(): PreviewSaveStore {
    if (!this._store) {
      throw new Error("Saves are not kept before the extension activates");
    }
    return this._store;
  }

  list(): Promise<PreviewSave[]> {
    return this.store.list(WORKSPACE_SAVES);
  }

  write(save: PreviewSave): Promise<void> {
    return this.store.write(WORKSPACE_SAVES, save);
  }

  rename(id: string, name: string): Promise<void> {
    return this.store.rename(WORKSPACE_SAVES, id, name);
  }

  delete(ids: readonly string[]): Promise<void> {
    return this.store.delete(WORKSPACE_SAVES, ids);
  }
}
