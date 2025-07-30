import { MessageProtocol } from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { ExecuteCommandMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ExecuteCommandMessage";
import {
  ReadDirectoryFilesMessage,
  ReadDirectoryFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage";
import {
  ReadFileMessage,
  ReadFileParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import {
  WillCreateFilesMessage,
  WillCreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage";
import {
  WillDeleteFilesMessage,
  WillDeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import {
  WillRenameFilesMessage,
  WillRenameFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillRenameFilesMessage";
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  FileData,
  ProjectMetadataField,
} from "@impower/spark-editor-protocol/src/types";
import GRAMMAR from "../../../../../packages/sparkdown/language/sparkdown.language-grammar.json";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import getTextBuffer from "./utils/getTextBuffer";

const FILE_SEPARATOR_PREFIX = "//// ";
const FILE_SEPARATOR_SUFFIX = " ////";
const FILE_SPLITTER_REGEX = new RegExp(
  GRAMMAR.repository.FileSplitter.match,
  "umg"
);
const FILE_SEPARATOR_REGEX = new RegExp(GRAMMAR.repository.FileSeparator.match);
const FILE_NAME_CAPTURE_INDEX = 3;

const cmp = (a: any, b: any) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
};

export default class WorkspaceFileSystem {
  protected _worker: Worker;

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this)
  );

  protected _preloaded: Record<string, HTMLElement> = {};

  protected _scheme = "file://";
  get scheme() {
    return this._scheme;
  }

  protected _loadedProjectId?: string;

  protected _files?: Record<string, FileData>;

  constructor() {
    const projectId = this.getLoadedProjectId();
    this._loadedProjectId = projectId;
    this._worker = new Worker("/opfs-workspace.js");
    this._worker.onerror = (e) => {
      console.error(e);
    };
    this._worker.addEventListener("message", this.handleWorkerMessage);
    this._initialFilesRef.get(projectId);
  }

  getLoadedProjectId() {
    return workspace.current.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
  }

  protected async loadInitialFiles(projectId: string) {
    const directoryUri = this.getDirectoryUri(projectId);
    const files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    this._files ??= {};
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      result[file.uri] = file;
      this.preloadFile(file);
    });
    if (!files.some((f) => f.name === "main" && f.type === "script")) {
      // Create a default empty main script if one doesn't exist
      this._files ??= {};
      const mainScriptUri = this.getFileUri(projectId, "main.sd");
      const text = "";
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(text);
      this._files[mainScriptUri] = {
        name: "main",
        ext: "sd",
        type: "script",
        uri: mainScriptUri,
        version: 0,
        text,
        src: URL.createObjectURL(
          new Blob([encodedText], { type: "text/plain" })
        ),
      };
    }
    Workspace.ls.connection.onRequest(
      ExecuteCommandMessage.type,
      async (params) => {
        // TODO: handle fetching latest text with workspace/textDocumentContent/refresh instead?
        if (params.command === "sparkdown.readTextDocument") {
          const [uri] = params.arguments || [];
          if (uri && typeof uri === "string") {
            const buffer = await this.readFile({ file: { uri } });
            const text = new TextDecoder("utf-8").decode(buffer);
            const result = { uri, text };
            return result;
          }
        }
        return undefined;
      }
    );
    await Workspace.ls.start(
      this.getDirectoryUri(projectId),
      Object.values(this._files)
    );
    return result;
  }

  protected emit<T>(eventName: string, detail?: T): boolean {
    return window.dispatchEvent(
      new CustomEvent(eventName, {
        bubbles: true,
        cancelable: true,
        composed: true,
        detail,
      })
    );
  }

  protected _messageQueue: Record<
    string,
    { resolve: (result: any) => void; reject: (err: any) => void }
  > = {};

  protected handleWorkerMessage = async (event: MessageEvent) => {
    const message = event.data;
    if (ConfigurationMessage.type.isRequest(message)) {
      const params = message.params;
      const result = params.items.map((item) => {
        if (item.section === "sparkdown") {
          return Workspace.configuration.settings;
        }
        return {};
      });
      this._worker.postMessage(
        ConfigurationMessage.type.response(message.id, result)
      );
    } else if (DidWriteFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        this._files ??= {};
        this._files[file.uri] = file;
        this.preloadFile(file);
      });
      this.emit(MessageProtocol.event, message);
    } else if (DidCreateFilesMessage.type.isNotification(message)) {
      Workspace.ls.connection.sendNotification(message.method, message.params);
      this.emit(MessageProtocol.event, message);
    } else if (DidDeleteFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        delete this._files?.[file.uri];
      });
      Workspace.ls.connection.sendNotification(message.method, message.params);
      this.emit(MessageProtocol.event, message);
    } else if (DidRenameFilesMessage.type.isNotification(message)) {
      message.params.files.forEach((file) => {
        this._files ??= {};
        const oldFile = this._files[file.oldUri];
        if (oldFile) {
          const newFile = { ...oldFile, uri: file.newUri };
          this._files[file.newUri] = newFile;
          this.preloadFile(newFile);
          delete this._files[file.oldUri];
          delete this._preloaded[file.oldUri];
        }
      });
      Workspace.ls.connection.sendNotification(message.method, message.params);
      this.emit(MessageProtocol.event, message);
    } else if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
      Workspace.ls.connection.sendNotification(message.method, message.params);
      this.emit(MessageProtocol.event, message);
    } else if (message.error) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.reject(message.error);
        delete this._messageQueue[message.id];
      }
    } else if (message.result !== undefined) {
      const handler = this._messageQueue[message.id];
      if (handler) {
        handler.resolve(message.result);
        delete this._messageQueue[message.id];
      }
    } else {
      console.error("Unrecognized message: ", message);
    }
  };

  protected async sendRequest<M extends string, P, R>(
    type: MessageProtocolRequestType<M, P, R>,
    params: P,
    transfer: Transferable[] = []
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      const request = type.request(params);
      this._messageQueue[request.id] = { resolve, reject };
      this._worker.postMessage(request, transfer);
    });
  }

  getDirectoryUri(projectId: string) {
    return `${this._scheme}${projectId}`;
  }

  getFileUri(projectId: string, filename: string) {
    return `${this.getDirectoryUri(projectId)}/${filename}`;
  }

  getFilename(uri: string) {
    return uri.split("/").slice(-1).join("");
  }

  getDisplayName(uri: string) {
    const fileName = this.getFilename(uri);
    return fileName.split(".")[0] ?? "";
  }

  async getFiles(projectId: string) {
    if (this._loadedProjectId !== projectId) {
      throw new Error(`Project not loaded: ${projectId}`);
    }
    await this._initialFilesRef.get(projectId);
    if (!this._files) {
      throw new Error("Workspace File System not initialized.");
    }
    return this._files;
  }

  protected async readDirectoryFiles(
    params: ReadDirectoryFilesParams
  ): Promise<FileData[]> {
    return this.sendRequest(ReadDirectoryFilesMessage.type, params);
  }

  async readProjectMetadata(projectId: string, field: ProjectMetadataField) {
    const uri = this.getFileUri(projectId, `.${field}`);
    const files = await this.getFiles(projectId);
    const file = files[uri];
    const name = file?.text || "";
    return name;
  }

  async writeProjectMetadata(
    projectId: string,
    field: ProjectMetadataField,
    value: string
  ) {
    const uri = this.getFileUri(projectId, `.${field}`);
    await this.writeTextDocument({
      textDocument: { uri, version: 0, text: value },
    });
  }

  async readProjectZip(projectId: string): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter((file) => file.name)
      .map(({ uri }) => ({ uri }));
    return this.zipFiles({ files });
  }

  async writeProjectZip(projectId: string, content: ArrayBuffer) {
    const existingFiles = await this.getFiles(projectId);
    const unzipped = await this.unzipFiles({ data: content });
    const zipFilesToWrite = unzipped.map(({ filename, data }) => ({
      uri: this.getFileUri(projectId, filename),
      data,
    }));
    const zipFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name && !zipFilesToWrite.some((file) => file.uri === uri)
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: zipFilesToWrite,
      }),
      this.deleteFiles({
        files: zipFilesToDelete,
      }),
    ]);
  }

  async readProjectScriptBundle(projectId: string) {
    return this.bundleProjectText(projectId);
  }

  async bundleProjectText(projectId: string): Promise<string> {
    const files = await this.getFiles(projectId);
    const mainScriptUri = this.getFileUri(projectId, "main.sd");
    const mainFile = files[mainScriptUri];
    let content = "";
    if (mainFile?.text != null) {
      content += `${mainFile.text}`;
    }
    Object.values(files)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .forEach((file) => {
        if (file.uri !== mainScriptUri) {
          if (file.text != null && file.name) {
            content += `\n\n${FILE_SEPARATOR_PREFIX}${file.name}.${file.ext}${FILE_SEPARATOR_SUFFIX}`;
            content += `\n\n${file.text}`;
          }
        }
      });
    return content.trim();
  }

  async readProjectAssetBundle(projectId: string): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter((file) => file.text == null && file.name)
      .map(({ uri }) => ({ uri }));
    return this.zipFiles({ files });
  }

  async writeProjectScriptBundle(projectId: string, content: string) {
    const existingFiles = await this.getFiles(projectId);
    const remoteFiles = this.splitProjectTextContent(projectId, content);
    const textFilesToWrite = Object.entries(remoteFiles).map(([uri, text]) => {
      const array = getTextBuffer(text);
      const arrayBuffer = array.buffer.slice(
        array.byteOffset,
        array.byteLength + array.byteOffset
      ) as ArrayBuffer;
      return {
        uri,
        data: arrayBuffer,
      };
    });
    const textFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name &&
          fileData.text != null &&
          !textFilesToWrite.some((file) => file.uri === uri)
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: textFilesToWrite,
      }),
      this.deleteFiles({
        files: textFilesToDelete,
      }),
    ]);
  }

  async writeProjectAssetBundle(projectId: string, content: ArrayBuffer) {
    const existingFiles = await this.getFiles(projectId);
    const unzipped = await this.unzipFiles({ data: content });
    const zipFilesToWrite = unzipped.map(({ filename, data }) => ({
      uri: this.getFileUri(projectId, filename),
      data,
    }));
    const zipFilesToDelete = Object.entries(existingFiles)
      .filter(
        ([uri, fileData]) =>
          fileData.name &&
          fileData.text == null &&
          !zipFilesToWrite.some((file) => file.uri === uri)
      )
      .map(([uri]) => ({ uri }));
    await Promise.all([
      this.createFiles({
        files: zipFilesToWrite,
      }),
      this.deleteFiles({
        files: zipFilesToDelete,
      }),
    ]);
  }

  splitProjectTextContent(
    projectId: string,
    text: string
  ): Record<string, string> {
    const chunks: Record<string, string> = {};
    let filename = "";
    text.split(FILE_SPLITTER_REGEX).forEach((content, index) => {
      const isEvenIndex = index % 2 === 0;
      if (isEvenIndex) {
        const uri = filename
          ? this.getFileUri(projectId, filename)
          : this.getFileUri(projectId, "main.sd");
        chunks[uri] = content.trim();
      } else {
        const match = content.trim().match(FILE_SEPARATOR_REGEX);
        filename = match?.[FILE_NAME_CAPTURE_INDEX]?.trim() || "";
      }
    });
    return chunks;
  }

  async zipFiles(params: { files: { uri: string }[] }) {
    const { files } = params;
    const result = await this.sendRequest(ZipFilesMessage.type, { files });
    return result;
  }

  async unzipFiles(params: { data: ArrayBuffer }) {
    const { data } = params;
    const result = await this.sendRequest(UnzipFilesMessage.type, { data });
    return result;
  }

  async readFile(params: ReadFileParams) {
    const result = await this.sendRequest(ReadFileMessage.type, params);
    return result;
  }

  async createFiles(params: WillCreateFilesParams) {
    const result = await this.sendRequest(
      WillCreateFilesMessage.type,
      params,
      params.files.map((file) => file.data)
    );
    return result;
  }

  async deleteFiles(params: WillDeleteFilesParams) {
    const result = await this.sendRequest(WillDeleteFilesMessage.type, params);
    return result;
  }

  async renameFiles(params: WillRenameFilesParams) {
    const result = await this.sendRequest(WillRenameFilesMessage.type, params);
    return result;
  }

  async writeTextDocument(params: {
    textDocument: { uri: string; version: number; text: string };
  }) {
    const { textDocument } = params;
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(textDocument.text);
    const result = await this.sendRequest(
      WillWriteFilesMessage.type,
      {
        files: [
          {
            uri: textDocument.uri,
            version: textDocument.version,
            data: encodedText.buffer,
          },
        ],
      },
      [encodedText.buffer]
    );
    return result;
  }

  async preloadFile(file: FileData) {
    try {
      await new Promise((resolve, reject) => {
        /* Preload image so it can be previewed instantly */
        if (file.type === "image") {
          const img = new Image();
          img.src = file.src;
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            reject(img);
          };
          this._preloaded[file.uri] = img;
        }
        /* We shouldn't need to preload audio */
        // else if (file.type === "audio") {
        //   const aud = new Audio();
        //   aud.src = file.src;
        //   aud.onload = () => {
        //     resolve(aud);
        //   };
        //   aud.onerror = () => {
        //     reject(aud);
        //   };
        //   this._preloaded[file.uri] = aud;
        // }
      });
    } catch (e) {
      console.warn("Could not load: ", file.name, file.src);
    }
  }

  async getUrl(uri: string) {
    if (this._loadedProjectId) {
      const files = await this.getFiles(this._loadedProjectId);
      return files[uri]?.src;
    }
    return undefined;
  }
}
