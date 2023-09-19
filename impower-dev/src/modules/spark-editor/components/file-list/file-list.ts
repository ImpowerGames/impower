import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { Component } from "../../../../../../packages/spec-component/src/component";
import getValidFileName from "../../utils/getValidFileName";
import globToRegex from "../../utils/globToRegex";
import { verifyFileType } from "../../utils/verifyFileType";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-list";

export default class FileList extends Component(spec) {
  protected _uris?: string[];

  protected _dragging = false;

  override onAttributeChanged(name: string) {
    if (name === FileList.attrs.include || name === FileList.attrs.exclude) {
      this.loadEntries();
    }
  }

  override onConnected() {
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

  override onDisconnected() {
    window.removeEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
    this.root.removeEventListener("dragenter", this.handleDragEnter);
    this.root.removeEventListener("dragleave", this.handleDragLeave);
    this.root.removeEventListener("dragover", this.handleDragOver);
    this.root.removeEventListener("drop", this.handleDrop);
  }

  protected handleDidChangeWatchedFiles = (e: Event) => {
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

  handleDragEnter = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = true;
    this.updateState();
  };

  handleDragLeave = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = false;
    this.updateState();
  };

  handleDragOver = async (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
    this._dragging = true;
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
      event.stopPropagation();
      this.upload(validFiles);
    }
    this._dragging = false;
    this.updateState();
  };

  async upload(fileArray: File[]) {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
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
    const outletEl = this.ref.outlet;
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
    const emptyEl = this.ref.empty;
    const dragoverEl = this.ref.dragover;
    const outletEl = this.ref.outlet;
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
