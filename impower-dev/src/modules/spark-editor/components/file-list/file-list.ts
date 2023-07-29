import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { WorkspaceEntry } from "@impower/spark-editor-protocol/src/types";
import { Properties } from "../../../../../../packages/spark-element/src/types/properties";
import getAttributeNameMap from "../../../../../../packages/spark-element/src/utils/getAttributeNameMap";
import { html } from "../../../../../../packages/spark-element/src/utils/html";
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
    return { ...super.attributes, ...DEFAULT_ATTRIBUTES };
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

  get outletEl() {
    return this.getElementByClass("outlet");
  }

  get outletSlot() {
    return this.getSlotByName("outlet");
  }

  protected _entries?: WorkspaceEntry[];

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
      const directory = this.directoryPath;
      if (directory) {
        const directoryUri = Workspace.fs.getWorkspaceUri(directory);
        if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
          const params = message.params;
          const changes = params.changes;
          const changedFileInDirectory = changes.some((file) =>
            file.uri.startsWith(directoryUri)
          );
          if (changedFileInDirectory) {
            this.loadEntries(directory);
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
      this._entries = [];
      return;
    }
    this._entries = await Workspace.fs.getWorkspaceEntries({
      directory: { uri: Workspace.fs.getWorkspaceUri(directoryPath) },
    });
    const pane = this.pane || "";
    const panel = this.panel || "";
    const outletSlot = this.outletSlot;
    outletSlot?.replaceChildren();
    if (this._entries.length > 0) {
      if (outletSlot) {
        this._entries.forEach((entry) => {
          const fileName = entry.uri.split("/").slice(-1).join("");
          const displayName = fileName.split(".")[0] ?? "";
          const template = document.createElement("template");
          template.innerHTML = html`
            <se-file-item
              pane="${pane}"
              panel="${panel}"
              directory-path="${directoryPath}"
              file-name="${fileName}"
            >
              ${displayName}
            </se-file-item>
          `;
          const templateContent = template.content.cloneNode(true);
          outletSlot.appendChild(templateContent);
        });
      }
    }
    this.updateState();
  }

  getState() {
    if (this._dragging && this.accept) {
      return "dragover";
    }
    if (this._entries && this._entries.length > 0) {
      return "list";
    }
    if (this._entries && this._entries.length === 0) {
      return "empty";
    }
    return null;
  }

  updateState() {
    const state = this.getState();
    const emptyEl = this.emptyEl;
    const dragoverEl = this.dragoverEl;
    const outletEl = this.outletEl;
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
