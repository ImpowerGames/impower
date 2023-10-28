import { MessageProtocolRequestType } from "@impower/spark-editor-protocol/src/protocols/MessageProtocolRequestType";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage.js";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage.js";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage.js";
import { DidWatchFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWatchFilesMessage.js";
import { DidWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFileMessage.js";
import {
  ReadDirectoryFilesMessage,
  ReadDirectoryFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage.js";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import {
  WillCreateFilesMessage,
  WillCreateFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage.js";
import {
  WillDeleteFilesMessage,
  WillDeleteFilesParams,
} from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage.js";
import { WillWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFileMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  FileData,
  ProjectMetadataField,
} from "@impower/spark-editor-protocol/src/types";
import GRAMMAR from "../../../../../packages/sparkdown/language/sparkdown.language-grammar.json";
import { SparkProgram } from "../../../../../packages/sparkdown/src/types/SparkProgram";
import SingletonPromise from "./SingletonPromise";
import { Workspace } from "./Workspace";
import { WorkspaceConstants } from "./WorkspaceConstants";
import workspace from "./WorkspaceStore";
import getTextBuffer from "./utils/getTextBuffer";

const CHUNK_SPLITTER_REGEX = new RegExp(
  GRAMMAR.repository.ChunkSplitter.match,
  "umg"
);
const CHUNK_REGEX = new RegExp(GRAMMAR.repository.Chunk.match);
const CHUNK_NAME_CAPTURE_INDEX = 3;

const cmp = (a: any, b: any) => {
  if (a > b) return +1;
  if (a < b) return -1;
  return 0;
};

export default class WorkspaceFileSystem {
  protected _fileSystemWorker = new Worker("/public/opfs-workspace.js");

  protected _initialFilesRef = new SingletonPromise(
    this.loadInitialFiles.bind(this)
  );

  protected _assetCache: Record<string, HTMLElement> = {};

  protected _scheme = "file://";
  get scheme() {
    return this._scheme;
  }

  protected _loadedProjectId?: string;

  protected _files?: Record<string, FileData>;

  constructor() {
    const projectId =
      workspace.current.project.id || WorkspaceConstants.LOCAL_PROJECT_ID;
    this._loadedProjectId = projectId;
    this._initialFilesRef.get(projectId);
    this._fileSystemWorker.addEventListener(
      "message",
      this.handleWorkerMessage
    );
  }

  protected async loadInitialFiles(projectId: string) {
    const connection = await Workspace.lsp.getConnection();
    const directoryUri = this.getDirectoryUri(projectId);
    const files = await this.readDirectoryFiles({
      directory: { uri: directoryUri },
    });
    const didWatchFilesParams = {
      files,
    };
    this._files ??= {};
    const result: Record<string, FileData> = {};
    files.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      result[file.uri] = file;
      this.preloadFile(file);
    });
    connection.sendNotification(DidWatchFilesMessage.type, didWatchFilesParams);
    this.emit(
      DidWatchFilesMessage.method,
      DidWatchFilesMessage.type.notification(didWatchFilesParams)
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
      this._fileSystemWorker.postMessage(
        ConfigurationMessage.type.response(message.id, result)
      );
    } else if (
      DidParseTextDocumentMessage.type.isNotification(message) ||
      DidWriteFileMessage.type.isNotification(message) ||
      DidCreateFilesMessage.type.isNotification(message) ||
      DidDeleteFilesMessage.type.isNotification(message)
    ) {
      this.emit(message.method, message);
    } else if (DidChangeWatchedFilesMessage.type.isNotification(message)) {
      const connection = await Workspace.lsp.getConnection();
      connection.sendNotification(message.method, message.params);
      this.emit(message.method, message);
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
      this._fileSystemWorker.postMessage(request, transfer);
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

  async readProjectTextContent(projectId: string) {
    return this.bundleProjectText(projectId);
  }

  async bundleProjectText(projectId: string): Promise<string> {
    const files = await this.getFiles(projectId);
    const mainScriptUri = this.getFileUri(projectId, "main.script");
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
            content += `\n\n% ${file.name}.${file.ext}`;
            content += `\n\n${file.text}`;
          }
        }
      });
    return content.trim();
  }

  async readProjectZipContent(projectId: string): Promise<ArrayBuffer> {
    const allFiles = await this.getFiles(projectId);
    const files = Object.values(allFiles)
      .sort((a, b) => cmp(a.ext, b.ext) || cmp(a.name, b.name))
      .filter((file) => file.text == null && file.name)
      .map(({ uri }) => ({ uri }));
    return this.zipFiles({ files });
  }

  async writeProjectTextContent(projectId: string, content: string) {
    const existingFiles = await this.getFiles(projectId);
    const remoteFiles = this.splitProjectTextContent(projectId, content);
    const textFilesToWrite = Object.entries(remoteFiles).map(([uri, text]) => ({
      uri,
      data: getTextBuffer(text).buffer,
    }));
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

  async writeProjectZipContent(projectId: string, content: ArrayBuffer) {
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
    text.split(CHUNK_SPLITTER_REGEX).forEach((content, index) => {
      const isEvenIndex = index % 2 === 0;
      if (isEvenIndex) {
        const uri = filename
          ? this.getFileUri(projectId, filename)
          : this.getFileUri(projectId, "main.script");
        chunks[uri] = content.trim();
      } else {
        const match = content.trim().match(CHUNK_REGEX);
        filename = match?.[CHUNK_NAME_CAPTURE_INDEX]?.trim() || "";
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

  async createFiles(params: WillCreateFilesParams) {
    const result = await this.sendRequest(
      WillCreateFilesMessage.type,
      params,
      params.files.map((file) => file.data)
    );
    result.forEach((file) => {
      this._files ??= {};
      this._files[file.uri] = file;
      this.preloadFile(file);
    });
    return result;
  }

  async deleteFiles(params: WillDeleteFilesParams) {
    const result = await this.sendRequest(WillDeleteFilesMessage.type, params);
    params.files.forEach((file) => {
      if (this._files) {
        delete this._files[file.uri];
        delete this._assetCache[file.uri];
      }
    });
    return result;
  }

  async writeTextDocument(params: {
    textDocument: { uri: string; version: number; text: string };
  }) {
    const { textDocument } = params;
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(textDocument.text);
    const result = await this.sendRequest(
      WillWriteFileMessage.type,
      {
        file: {
          uri: textDocument.uri,
          version: textDocument.version,
          data: encodedText.buffer,
        },
      },
      [encodedText.buffer]
    );
    this._files ??= {};
    this._files[result.uri] = result;
    return result;
  }

  async getPrograms(projectId: string) {
    const files = await this.getFiles(projectId);
    const programs = Object.values(files).filter(
      (f): f is FileData & { program: SparkProgram } => Boolean(f.program)
    );
    return programs;
  }

  async preloadFile(file: FileData) {
    try {
      await new Promise((resolve, reject) => {
        if (file.type === "image") {
          const img = new Image();
          img.src = file.src;
          img.onload = () => {
            resolve(img);
          };
          img.onerror = () => {
            reject(img);
          };
          this._assetCache[file.uri] = img;
        } else if (file.type === "audio") {
          const aud = new Audio();
          aud.src = file.src;
          aud.onload = () => {
            resolve(aud);
          };
          aud.onerror = () => {
            reject(aud);
          };
          this._assetCache[file.uri] = aud;
        }
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
