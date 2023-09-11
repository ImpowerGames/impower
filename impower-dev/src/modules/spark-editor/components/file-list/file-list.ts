import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { Component } from "../../../../../../packages/spec-component/src/component";
import getValidFileName from "../../utils/getValidFileName";
import globToRegex from "../../utils/globToRegex";
import { verifyFileType } from "../../utils/verifyFileType";
import { Workspace } from "../../workspace/Workspace";
import { WorkspaceCache } from "../../workspace/WorkspaceCache";
import spec from "./_file-list";

export default class FileList extends Component(spec) {
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

  override onAttributeChanged(name: string, newValue: string): void {
    if (name === FileList.attrs.include || name === FileList.attrs.exclude) {
      this.loadEntries();
    }
  }

  override onConnected(): void {
    this.loadEntries();
    window.addEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    this.root.addEventListener("dragenter", this.handleDragEnter);
    this.root.addEventListener("dragleave", this.handleDragLeave);
    this.root.addEventListener("dragover", this.handleDragOver);
    this.root.addEventListener("drop", this.handleDrop);
  }

  override onDisconnected(): void {
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
      if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
        const params = message.params;
        const changes = params.changes;
        const include = this.include;
        const exclude = this.exclude;
        const includeRegex = include ? globToRegex(include) : /.*/;
        const excludeRegex = exclude ? globToRegex(exclude) : undefined;
        const isRelevantChange = changes.some(
          (file) => includeRegex.test(file.uri) && !excludeRegex?.test(file.uri)
        );
        if (isRelevantChange) {
          this.loadEntries();
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
    const projectId = WorkspaceCache.get().project.id;
    if (projectId) {
      if (fileArray) {
        const files = await Promise.all(
          fileArray.map(async (file) => {
            const validFileName = getValidFileName(file.name);
            const data = await file.arrayBuffer();
            return {
              uri: Workspace.fs.getFileUri(projectId, validFileName),
              data,
            };
          })
        );
        await Workspace.fs.createFiles({
          files,
        });
      }
    }
  }

  async loadEntries() {
    const include = this.include;
    const exclude = this.exclude;
    const includeRegex = include ? globToRegex(include) : /.*/;
    const excludeRegex = exclude ? globToRegex(exclude) : undefined;
    const files = await Workspace.fs.getFiles();
    const allUris = Object.keys(files);
    this._uris = allUris.filter(
      (uri) => includeRegex.test(uri) && !excludeRegex?.test(uri)
    );
    const outletEl = this.listEl;
    outletEl?.replaceChildren();
    if (outletEl) {
      this._uris.forEach((uri) => {
        const filename = Workspace.fs.getFilename(uri);
        const displayName = Workspace.fs.getDisplayName(uri);
        const fileItem = document.createElement("se-file-item");
        fileItem.setAttribute("filename", filename);
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
