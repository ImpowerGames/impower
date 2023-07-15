import {
  ReadTextDocument,
  ReadTextDocumentParams,
} from "../../../spark-editor-protocol/src/protocols/textDocument/messages/ReadTextDocument";
import {
  WriteTextDocument,
  WriteTextDocumentParams,
} from "../../../spark-editor-protocol/src/protocols/textDocument/messages/WriteTextDocument";
import {
  WorkspaceDirectory,
  WorkspaceDirectoryParams,
} from "../../../spark-editor-protocol/src/protocols/workspace/messages/WorkspaceDirectory";
import { WorkspaceEntry } from "../../../spark-editor-protocol/src/types";

export interface WorkspaceState {
  window: string;
  panel: string;
}

export default class Workspace {
  private static _instance: Workspace;
  static get instance(): Workspace {
    if (!this._instance) {
      this._instance = new Workspace();
    }
    return this._instance;
  }

  worker = new Worker("/public/opfs-workspace.js");

  // TODO: Allow user to sync their data with a storage provider (like Github, Google Drive, or Dropbox)
  protected _uid = "anonymous";

  // TODO: Allow user to own more than one project
  protected _project = "default";

  getWorkspaceUri(path: string = "") {
    const suffix = path ? `/${path}` : "";
    return `file:///${this._uid}/projects/${this._project}${suffix}`;
  }

  async getWorkspaceDirectory(
    params: WorkspaceDirectoryParams
  ): Promise<WorkspaceEntry[]> {
    return new Promise((resolve) => {
      const request = WorkspaceDirectory.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (WorkspaceDirectory.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
          }
        }
      });
      this.worker.postMessage(request);
    });
  }

  async readTextDocument(params: ReadTextDocumentParams): Promise<string> {
    return new Promise((resolve) => {
      const request = ReadTextDocument.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (ReadTextDocument.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
          }
        }
      });
      this.worker.postMessage(request);
    });
  }

  async writeTextDocument(params: WriteTextDocumentParams): Promise<null> {
    return new Promise((resolve) => {
      const request = WriteTextDocument.request(params);
      this.worker.addEventListener("message", (event) => {
        const message = event.data;
        if (WriteTextDocument.isResponse(message)) {
          if (message.id === request.id) {
            resolve(message.result);
          }
        }
      });
      this.worker.postMessage(request);
    });
  }
}
