import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import {
  DidChangeWatchedFilesMessage,
  DidChangeWatchedFilesMethod,
  DidChangeWatchedFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { Component } from "../../../../../../packages/spec-component/src/component";
import globToRegex from "../../utils/globToRegex";
import { Workspace } from "../../workspace/Workspace";
import spec from "./_file-list";

export default class FileList extends Component(spec) {
  protected _uris?: string[];

  override onInit() {
    this.loadEntries();
  }

  override onConnected() {
    window.addEventListener(MessageProtocol.event, this.handleProtocol);
  }

  override onDisconnected() {
    window.removeEventListener(MessageProtocol.event, this.handleProtocol);
  }

  protected handleProtocol = (e: Event) => {
    if (e instanceof CustomEvent) {
      if (DidChangeWatchedFilesMessage.type.is(e.detail)) {
        this.handleDidChangeWatchedFiles(e.detail);
      }
    }
  };

  protected handleDidChangeWatchedFiles = (
    message: NotificationMessage<
      DidChangeWatchedFilesMethod,
      DidChangeWatchedFilesParams
    >
  ) => {
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
    const isCreate = changes.every(
      (change) => change.type === FileChangeType.Created
    );
    const isDelete = changes.every(
      (change) => change.type === FileChangeType.Deleted
    );
    // The order of the files shouldn't shift around while the user is renaming files.
    const isRename = changes.every((change) =>
      // Renaming files emits a Changed and Created event for the new uri
      change.type === FileChangeType.Created
        ? changes.some(
            (c) => c.uri === change.uri && c.type === FileChangeType.Changed
          )
        : change.type === FileChangeType.Changed
        ? changes.some(
            (c) => c.uri === change.uri && c.type === FileChangeType.Created
          )
        : true
    );
    if (
      isRelevantChange &&
      (params.remote || isCreate || isDelete || !isRename)
    ) {
      const firstFilename = Workspace.fs.getFilename(changes[0]?.uri || "");
      if (
        isCreate &&
        changes.length === 1 &&
        firstFilename &&
        firstFilename.endsWith(".sd")
      ) {
        // We created a script, so open it.
        const detail = { value: "logic-editor" };
        this.emit("changing", detail);
        this.emit("changed", detail);
        Workspace.window.openedFileEditor(firstFilename);
      } else {
        // Otherwise, reload the list to reflect the changes.
        const scrollIntoView =
          isCreate && !params.remote ? changes.map((c) => c.uri) : undefined;
        this.loadEntries(scrollIntoView);
      }
    }
  };

  async loadEntries(scrollIntoView?: string[]) {
    this._uris = await this.loadFiles();
    const outletEl = this.ref.outlet;
    if (outletEl) {
      const items = this.createItems(this._uris);
      outletEl.innerHTML = items.join("\n");
      if (scrollIntoView) {
        const uriToScrollTo = this._uris.findLast((uri) =>
          scrollIntoView?.includes(uri)
        );
        if (uriToScrollTo) {
          const filenameToScrollTo = Workspace.fs.getFilename(uriToScrollTo);
          const fileItemToScrollTo = outletEl.querySelector(
            `se-file-item[filename=${filenameToScrollTo.replaceAll(
              ".",
              "\\."
            )}]`
          );
          const fileItemChildToScrollTo =
            fileItemToScrollTo?.shadowRoot?.firstElementChild?.shadowRoot
              ?.firstElementChild;
          fileItemChildToScrollTo?.scrollIntoView({
            behavior: "smooth",
          });
        }
      }
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
    const listEl = this.ref.list;
    const els = { empty: emptyEl, list: listEl };
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
