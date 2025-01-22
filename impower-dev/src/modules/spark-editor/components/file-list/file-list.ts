import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { Component } from "../../../../../../packages/spec-component/src/component";
import globToRegex from "../../utils/globToRegex";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-list";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";

export default class FileList extends Component(spec) {
  protected _uris?: string[];

  override onInit() {
    this.loadEntries();
  }

  override onConnected() {
    window.addEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
  }

  override onDisconnected() {
    window.removeEventListener(
      DidChangeWatchedFilesMessage.method,
      this.handleDidChangeWatchedFiles
    );
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
          (change) =>
            includeRegex.test(change.uri) && !excludeRegex?.test(change.uri)
        );
        // The order of the files shouldn't shift around while the user is renaming files.
        const isLocalRename =
          !params.remote &&
          changes.every((change) =>
            // Renaming files emits a Changed and Created event for the new uri
            change.type === FileChangeType.Created
              ? changes.some(
                  (c) =>
                    c.uri === change.uri && c.type === FileChangeType.Changed
                )
              : change.type === FileChangeType.Changed
              ? changes.some(
                  (c) =>
                    c.uri === change.uri && c.type === FileChangeType.Created
                )
              : true
          );
        if (isRelevantChange && !isLocalRename) {
          this.loadEntries();
        }
      }
    }
  };

  async loadEntries() {
    this._uris = await this.loadFiles();
    const outletEl = this.ref.outlet;
    if (outletEl) {
      const items = this.createItems(this._uris);
      outletEl.innerHTML = items.join("\n");
    }
    this.updateState();
  }

  createItems(uris: string[]) {
    const items: string[] = [];
    uris.forEach((uri) => {
      const filename = Workspace.fs.getFilename(uri);
      items.push(`<se-file-item filename="${filename}"></se-file-item>`);
    });
    return items;
  }

  async loadFiles() {
    const store = this.stores.workspace.current;
    const projectId = store?.project?.id;
    if (projectId) {
      const include = this.include;
      const exclude = this.exclude;
      const includeRegex = include ? globToRegex(include) : /.*/;
      const excludeRegex = exclude ? globToRegex(exclude) : undefined;
      const files = await Workspace.fs.getFiles(projectId);
      const allUris = Object.keys(files);
      return allUris
        .filter((uri) => includeRegex.test(uri) && !excludeRegex?.test(uri))
        .sort()
        .sort((a, b) => {
          const extA = a.split(".").at(-1) || "";
          const extB = b.split(".").at(-1) || "";
          if (extA < extB) {
            return -1;
          }
          if (extA > extB) {
            return 1;
          }
          return 0;
        });
    }
    return [];
  }

  getState() {
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
    const outletEl = this.ref.outlet;
    const els = { empty: emptyEl, list: outletEl };
    Object.entries(els).forEach(([k, v]) => {
      if (v) {
        v.hidden = k !== state;
      }
    });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "se-file-list": FileList;
  }
}
