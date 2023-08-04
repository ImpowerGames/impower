import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import SEElement from "../../core/se-element";
import getValidFileName from "../../utils/getValidFileName";
import { verifyFileType } from "../../utils/verifyFileType";
import { Workspace } from "../../workspace/Workspace";
import component from "./_file-list";

const DEFAULT_ATTRIBUTES = {
  ...getAttributeNameMap(["pane", "panel", "directory-path", "accept"]),
};

/**
 * Progress bars are used to show the status of an ongoing operation.
 */
export default class FileList
  extends SEElement
  implements Properties<typeof DEFAULT_ATTRIBUTES>
{
  static override get attributes() {
    return DEFAULT_ATTRIBUTES;
  }

  static override async define(
    tagName = "se-file-list",
    dependencies?: Record<string, string>,
    useShadowDom = true
  ): Promise<CustomElementConstructor> {
    return super.define(tagName, dependencies, useShadowDom);
  }

  override get component() {
    return component();
  }

  /**
   * The pane where this file list is displayed.
   */
  get pane(): string | null {
    return this.getStringAttribute(FileList.attributes.pane);
  }
  set pane(value) {
    this.setStringAttribute(FileList.attributes.pane, value);
  }

  /**
   * The panel where this file list is displayed.
   */
  get panel(): string | null {
    return this.getStringAttribute(FileList.attributes.panel);
  }
  set panel(value) {
    this.setStringAttribute(FileList.attributes.panel, value);
  }

  /**
   * The directory path to read from.
   */
  get directoryPath(): string | null {
    return this.getStringAttribute(FileList.attributes.directoryPath);
  }
  set directoryPath(value) {
    this.setStringAttribute(FileList.attributes.directoryPath, value);
  }

  /**
   * The file types to accept when drag-and-dropping files for upload.
   */
  get accept(): string | null {
    return this.getStringAttribute(FileList.attributes.accept);
  }
  set accept(value) {
    this.setStringAttribute(FileList.attributes.accept, value);
  }

  get emptyEl() {
    return this.getElementByClass("empty");
  }

  get dragoverEl() {
    return this.getElementByClass("dragover");
  }

  get listEl() {
    return this.getElementByClass("outlet");
  }

  protected _uris?: string[];

  protected _dragging = false;

  protected override onAttributeChanged(
    name: string,
    _oldValue: string,
    newValue: string
  ): void {
    if (name === FileList.attributes.directoryPath) {
      this.loadEntries(newValue);
    }
  }

  protected override onConnected(): void {
    this.loadEntries(this.directoryPath);
    window.addEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    this.root.addEventListener("dragenter", this.handleDragEnter);
    this.root.addEventListener("dragleave", this.handleDragLeave);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("drop", this.handleDrop);
  }

  protected override onDisconnected(): void {
    window.removeEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    this.root.removeEventListener("dragenter", this.handleDragEnter);
    this.root.removeEventListener("dragleave", this.handleDragLeave);
    this.root.removeEventListener("dragover", this.handleDragOver);
    this.root.removeEventListener("drop", this.handleDrop);
  }

  protected handleDidChangeWatchedFiles = (e: Event): void => {
    if (e instanceof CustomEvent) {
      const message = e.detail;
      const directoryPath = this.directoryPath;
      if (directoryPath) {
        const directoryUri = Workspace.fs.getWorkspaceUri(directoryPath);
        if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
          const params = message.params;
          const changes = params.changes;
          const changedFileInDirectory = changes.some((file) =>
            file.uri.startsWith(directoryUri)
          );
          if (changedFileInDirectory) {
            this.loadEntries(directoryPath);
          }
        }
      }
    }
  };

  handleDragEnter = async (_e: Event) => {
    this._dragging = true;
    this.updateState();
  };

  handleDragLeave = async (_e: Event) => {
    this._dragging = false;
    this.updateState();
  };

  handleDragOver = async (e: Event) => {
    this._dragging = true;
    e.preventDefault();
    this.updateState();
  };

  handleDrop = async (e: Event) => {
    const event = e as DragEvent;
    const accept = this.accept;
    const validFiles = Array.from(event.dataTransfer?.files || []).filter(
      (file) => verifyFileType(file.type, accept ?? "")
    );
    if (this._dragging && validFiles.length > 0) {
      event.preventDefault();
      this.upload(validFiles);
    }
    this._dragging = false;
    this.updateState();
  };

  async upload(fileArray: File[]) {
    if (fileArray) {
      const directoryPath = this.directoryPath;
      if (!directoryPath) {
        return;
      }
      const files = await Promise.all(
        fileArray.map(async (file) => {
          const validFileName = getValidFileName(file.name);
          const data = await file.arrayBuffer();
          return {
            uri: Workspace.fs.getWorkspaceUri(directoryPath, validFileName),
            data,
          };
        })
      );
      await Workspace.fs.createFiles({
        files,
      });
    }
  }

  async loadEntries(directoryPath: string | null) {
    if (!directoryPath) {
      this._uris = [];
      return;
    }
    this._uris = await Workspace.fs.getFilesInDirectory(directoryPath);
    const pane = this.pane || "";
    const panel = this.panel || "";
    const outletEl = this.listEl;
    outletEl?.replaceChildren();
    if (outletEl) {
      this._uris.forEach((uri) => {
        const fileName = Workspace.fs.getFileName(uri);
        const displayName = Workspace.fs.getName(uri);
        const fileItem = document.createElement("se-file-item");
        fileItem.setAttribute("pane", pane);
        fileItem.setAttribute("panel", panel);
        fileItem.setAttribute("directory-path", directoryPath);
        fileItem.setAttribute("file-name", fileName);
        fileItem.textContent = displayName;
        outletEl.appendChild(fileItem);
      });
    }
    this.updateState();
  }

  getState() {
    if (this._dragging && this.accept) {
      return "dragover";
    }
    if (this._uris && this._uris.length > 0) {
      return "list";
    }
    if (this._uris && this._uris.length === 0) {
      return "empty";
    }
    return null;
  }

  updateState() {
    const state = this.getState();
    const emptyEl = this.emptyEl;
    const dragoverEl = this.dragoverEl;
    const outletEl = this.listEl;
    const els = { empty: emptyEl, dragover: dragoverEl, list: outletEl };
    Object.entries(els).forEach(([k, v]) => {
      if (v) {
        v.hidden = k !== state;
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "s-file-list": FileList;
  }
}
