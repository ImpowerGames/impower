import { ErrorCodes } from "@impower/spark-editor-protocol/src/enums/ErrorCodes";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { ApplyWorkspaceEditMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage";
import { DidRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidRenameFilesMessage";
import { DidWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFilesMessage";
import { ReadDirectoryFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage";
import { WillCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage";
import { WillDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage";
import { WillRenameFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillRenameFilesMessage";
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  CreateFile,
  DeleteFile,
  FileCreate,
  FileData,
  FileEvent,
  RenameFile,
  TextDocumentEdit,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { ResponseMessage } from "@impower/spark-editor-protocol/src/types/base/ResponseMessage";
import { Zippable, unzipSync, zipSync } from "fflate";
import {
  TextDocument,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";
import debounce from "./utils/debounce";
import { getAllFilesRecursive } from "./utils/getAllFilesRecursive";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileExtension } from "./utils/getFileExtension";
import { getFileHandleFromUri } from "./utils/getFileHandleFromUri";
import { getFileName } from "./utils/getFileName";
import { getName } from "./utils/getName";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";
import { getSrcFromUri } from "./utils/getSrcFromUri";
import { getUriFromPath } from "./utils/getUriFromPath";

console.log("running opfs-workspace v1.0");

const MAGENTA = "\x1b[35m%s\x1b[0m";

const WRITE_DEBOUNCE_DELAY = 100;

const NEWLINE_REGEX = /\r\n|\r|\n/g;

const LANGUAGE_ID = "sparkdown";

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i",
  );
};

abstract class State {
  static imageFilePattern?: RegExp;
  static audioFilePattern?: RegExp;
  static fontFilePattern?: RegExp;
  static scriptFilePattern?: RegExp;
  static writeQueue = new Map<
    string,
    {
      handler: (uri: string) => void;
      version: number;
      buffer: DataView | Uint8Array;
      listeners: ((result: { file: FileData; created: boolean }) => void)[];
    }
  >();
  static files = new Map<string, FileData>();
  static documents = new Map<string, TextDocument>();
}

const channel = new BroadcastChannel("opfs-workspace");
channel.onmessage = (event) => {
  postMessage(event.data);
};
const broadcast = (message: NotificationMessage) => {
  postMessage(message);
  const remoteMessage = structuredClone(message);
  remoteMessage.params.remote = true;
  channel.postMessage(remoteMessage);
};
const respond = (message: ResponseMessage, transfer?: Transferable[]) => {
  if (transfer) {
    postMessage(message, transfer);
  } else {
    postMessage(message);
  }
};

const initialConfigurationMessage = ConfigurationMessage.type.request({
  items: [{ section: "sparkdown" }],
});
postMessage(initialConfigurationMessage);

onmessage = async (e) => {
  const message = e.data;
  if (ConfigurationMessage.type.isResponse(message)) {
    if (message.id === initialConfigurationMessage.id) {
      const settings = message.result?.[0];
      loadConfiguration(settings);
    }
  }
  if (DidChangeConfigurationMessage.type.isNotification(message)) {
    const { settings } = message.params;
    loadConfiguration(settings);
  }
  if (ReadDirectoryFilesMessage.type.isRequest(message)) {
    try {
      const { directory } = message.params;
      const files = await readDirectoryFiles(directory.uri);
      const response = ReadDirectoryFilesMessage.type.response(
        message.id,
        files,
      );
      respond(response);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadDirectoryFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (ReadFileMessage.type.isRequest(message)) {
    try {
      const { file } = message.params;
      const buffer = await readFile(file.uri);
      const response = ReadFileMessage.type.response(message.id, buffer);
      respond(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadFileMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (ZipFilesMessage.type.isRequest(message)) {
    const { files } = message.params;
    try {
      const buffer = (await zipFiles(files)) as ArrayBuffer;
      const response = ZipFilesMessage.type.response(message.id, buffer);
      respond(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ZipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (UnzipFilesMessage.type.isRequest(message)) {
    try {
      const { data } = message.params;
      const files = await unzipFiles(data);
      const response = UnzipFilesMessage.type.response(message.id, files);
      respond(
        response,
        files.map(({ data }) => data),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = UnzipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillWriteFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const result = await writeFiles(files);
      const response = WillWriteFilesMessage.type.response(
        message.id,
        result.map((r) => r.file),
      );
      respond(response);
      broadcast(
        DidWriteFilesMessage.type.notification({
          files: result.map((r) => r.file),
          remote: false,
        }),
      );
      broadcast(
        DidChangeWatchedFilesMessage.type.notification({
          changes: result.map((r) => ({
            uri: r.file.uri,
            type: FileChangeType.Changed,
          })),
        }),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillWriteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillCreateFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const result = await createFiles(files);
      const response = WillCreateFilesMessage.type.response(
        message.id,
        result.map((r) => r.file),
      );
      respond(response);
      broadcast(
        DidWriteFilesMessage.type.notification({
          files: result.map((r) => r.file),
          remote: false,
        }),
      );
      const createdResult = result.filter((r) => r.created);
      if (createdResult.length > 0) {
        broadcast(
          DidCreateFilesMessage.type.notification({
            files: createdResult.map((r) => ({
              uri: r.file.uri,
            })),
          }),
        );
      }
      broadcast(
        DidChangeWatchedFilesMessage.type.notification({
          changes: result.map((r) => ({
            uri: r.file.uri,
            type: r.created ? FileChangeType.Created : FileChangeType.Changed,
          })),
        }),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillCreateFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillDeleteFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const deletedFiles = await deleteFiles(files);
      const response = WillDeleteFilesMessage.type.response(
        message.id,
        deletedFiles.filter((d): d is FileData => d != null),
      );
      respond(response);
      broadcast(
        DidDeleteFilesMessage.type.notification({
          files,
        }),
      );
      broadcast(
        DidChangeWatchedFilesMessage.type.notification({
          changes: files.map((file) => ({
            uri: file.uri,
            type: FileChangeType.Deleted,
          })),
        }),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillDeleteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (WillRenameFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const renamedFiles = await renameFiles(files);
      const response = WillRenameFilesMessage.type.response(
        message.id,
        renamedFiles.map((f) => f.file),
      );
      respond(response);
      broadcast(
        DidWriteFilesMessage.type.notification({
          files: files.map((r) => State.files.get(r.newUri)!),
          remote: false,
        }),
      );
      broadcast(DidRenameFilesMessage.type.notification({ files }));
      broadcast(
        DidChangeWatchedFilesMessage.type.notification({
          changes: [
            ...files.map(
              (file): FileEvent => ({
                uri: file.oldUri,
                type: FileChangeType.Deleted,
              }),
            ),
            ...files.map(
              (file): FileEvent => ({
                uri: file.newUri,
                type: FileChangeType.Changed,
              }),
            ),
            ...files.map(
              (file): FileEvent => ({
                uri: file.newUri,
                type: FileChangeType.Created,
              }),
            ),
          ],
        }),
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillRenameFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (ApplyWorkspaceEditMessage.type.isRequest(message)) {
    // TODO: Use zenfs to support workspace.workspaceEdit.failureHandling === "transactional"
    // Currently only supports workspace.workspaceEdit.failureHandling === "abort"
    const { edit } = message.params;

    const writeFileMap = new Map<string, FileData>();
    const fileEvents: FileEvent[] = [];
    const createEvents: CreateFile[] = [];
    const deleteEvents: DeleteFile[] = [];
    const renameEvents: RenameFile[] = [];

    let changeIndex = 0;

    try {
      if (edit.documentChanges) {
        for (const c of edit.documentChanges) {
          if ("kind" in c && !("textDocument" in c)) {
            if (c.kind === "create") {
              const result = await createFiles([c]);
              const created = result.filter((r) => r.created);
              const changed = result.filter((r) => !r.created);
              for (const create of created) {
                const uri = create.file.uri;
                createEvents.push(c);
                fileEvents.push({
                  uri,
                  type: FileChangeType.Created,
                });
                const file = State.files.get(uri);
                if (file) {
                  writeFileMap.set(uri, file);
                }
              }
              for (const change of changed) {
                const uri = change.file.uri;
                fileEvents.push({
                  uri,
                  type: FileChangeType.Changed,
                });
                const file = State.files.get(uri);
                if (file) {
                  writeFileMap.set(uri, file);
                }
              }
            } else if (c.kind === "delete") {
              await deleteFiles([c]);
              const uri = c.uri;
              deleteEvents.push(c);
              fileEvents.push({ uri, type: FileChangeType.Deleted });
            } else if (c.kind === "rename") {
              await renameFiles([c]);
              renameEvents.push(c);
              fileEvents.push({
                uri: c.oldUri,
                type: FileChangeType.Deleted,
              });
              fileEvents.push({
                uri: c.newUri,
                type: FileChangeType.Created,
              });
              const file = State.files.get(c.newUri);
              if (file) {
                writeFileMap.set(c.newUri, file);
              }
            }
          } else {
            const uri = c.textDocument.uri;
            await editTextFiles([c]);
            fileEvents.push({
              uri: uri,
              type: FileChangeType.Changed,
            });
            const file = State.files.get(uri);
            if (file) {
              writeFileMap.set(uri, file);
            }
          }
          changeIndex++;
        }
      } else if (edit.changes) {
        for (const [uri, edits] of Object.entries(edit.changes)) {
          const beforeVersion = State.files.get(uri)?.version ?? 0;
          await editTextFiles([
            { textDocument: { uri, version: beforeVersion }, edits },
          ]);
          fileEvents.push({
            uri: uri,
            type: FileChangeType.Changed,
          });
          const file = State.files.get(uri);
          if (file) {
            writeFileMap.set(uri, file);
          }
        }
      }

      if (createEvents.length > 0) {
        broadcast(
          DidCreateFilesMessage.type.notification({
            files: createEvents,
          }),
        );
      }
      if (deleteEvents.length > 0) {
        broadcast(
          DidDeleteFilesMessage.type.notification({
            files: deleteEvents,
          }),
        );
      }
      if (renameEvents.length > 0) {
        broadcast(
          DidRenameFilesMessage.type.notification({
            files: renameEvents,
          }),
        );
      }

      broadcast(
        DidWriteFilesMessage.type.notification({
          files: Array.from(writeFileMap.values()),
          remote: false,
        }),
      );

      broadcast(
        DidChangeWatchedFilesMessage.type.notification({
          changes: fileEvents,
        }),
      );

      const response = ApplyWorkspaceEditMessage.type.response(message.id, {
        applied: true,
      });
      respond(response);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ApplyWorkspaceEditMessage.type.response(message.id, {
        applied: false,
        failureReason: err.message,
        failedChange: changeIndex,
      });
      respond(response);
    }
  }
};

const loadConfiguration = (settings: any) => {
  const scriptFiles = settings?.scriptFiles;
  if (scriptFiles) {
    State.scriptFilePattern = globToRegex(scriptFiles);
  }
  const imageFiles = settings?.imageFiles;
  if (imageFiles) {
    State.imageFilePattern = globToRegex(imageFiles);
  }
  const audioFiles = settings?.audioFiles;
  if (audioFiles) {
    State.audioFilePattern = globToRegex(audioFiles);
  }
  const fontFiles = settings?.fontFiles;
  if (fontFiles) {
    State.fontFilePattern = globToRegex(fontFiles);
  }
};

const readDirectoryFiles = async (directoryUri: string) => {
  const root = await navigator.storage.getDirectory();
  const directoryPath = getPathFromUri(directoryUri);
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  const directoryEntries = await getAllFilesRecursive(
    directoryHandle,
    directoryPath,
  );
  const files = await Promise.all(
    directoryEntries.map(async (entry) => {
      const uri = getUriFromPath(entry.path);
      if (!State.files.get(uri)) {
        await readFile(uri);
      }
      return State.files.get(uri)!;
    }),
  );
  return files;
};

const readFile = async (fileUri: string) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri, false);
  const fileRef = await fileHandle.getFile();
  const buffer = await fileRef.arrayBuffer();
  updateFileCache(fileUri, buffer, false);
  return buffer;
};

const zipFiles = async (files: { uri: string }[]) => {
  const root = await navigator.storage.getDirectory();
  const refs = await Promise.all(
    files.map(async ({ uri }) => {
      const fileHandle = await getFileHandleFromUri(root, uri, false);
      const fileRef = await fileHandle.getFile();
      const arrayBuffer = await fileRef.arrayBuffer();
      return { uri, name: fileRef.name, arrayBuffer };
    }),
  );
  const zippable: Zippable = {};
  refs.forEach((ref) => {
    zippable[ref.name] = new Uint8Array(ref.arrayBuffer);
  });
  const zipped = zipSync(zippable, {
    level: 0,
  });
  console.log(
    MAGENTA,
    "ZIPPED",
    `${refs.length} files (${formatBytes(zipped.buffer.byteLength)})`,
  );
  return zipped.buffer;
};

const unzipFiles = async (data: ArrayBuffer) => {
  const unzipped = unzipSync(new Uint8Array(data));
  const files = Object.entries(unzipped).map(([filename, data]) => ({
    filename: getFileName(filename),
    data: data.buffer as ArrayBuffer,
  }));
  console.log(MAGENTA, "UNZIPPED", `${files.length} files`);
  return files;
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes <= 0) return "0 Bytes";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB", "EB", "ZB", "YB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const bytesToDataUrl = async (bytes: Uint8Array, mimeType: string) => {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mimeType }));
  });
};

const dataUrlToBytes = async (dataUrl: string) => {
  const res = await fetch(dataUrl);
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const editTextFiles = async (textDocumentEdits: TextDocumentEdit[]) => {
  const result = await Promise.all(
    textDocumentEdits.map(async (textDocumentEdit) => {
      const td = textDocumentEdit.textDocument;
      const changes = textDocumentEdit.edits;
      if (textDocumentEdit.edits.length === 0) {
        return {
          file: { uri: td.uri } as FileData,
          created: false,
        };
      }
      let syncedDocument = State.documents.get(td.uri);
      if (!syncedDocument) {
        throw new Error(`File does not exist: ${td.uri}`);
      }
      const beforeVersion = syncedDocument.version;
      const normalizedChanges: TextDocumentContentChangeEvent[] = [];
      for (const c of changes) {
        const normalizedText = c.newText.replace(NEWLINE_REGEX, "\n");
        if ("range" in c) {
          normalizedChanges.push({
            range: c.range,
            text: normalizedText,
          });
        } else {
          normalizedChanges.push({
            text: normalizedText,
          });
        }
      }
      const afterVersion = syncedDocument.version + 1;
      syncedDocument = TextDocument.update(
        syncedDocument,
        normalizedChanges,
        afterVersion,
      );
      const content = syncedDocument.getText();
      State.documents.set(td.uri, syncedDocument);
      const encoder = new TextEncoder();
      const encodedText = encoder.encode(content);
      const buffer = new DataView(encodedText.buffer);
      return enqueueWrite(td.uri, afterVersion, buffer);
    }),
  );
  return result;
};

const enqueueWrite = async (
  fileUri: string,
  version: number,
  buffer: DataView | Uint8Array,
) => {
  return new Promise<{ file: FileData; created: boolean }>((resolve) => {
    if (!State.writeQueue.get(fileUri)) {
      State.writeQueue.set(fileUri, {
        buffer,
        version,
        listeners: [],
        handler: debounce(write, WRITE_DEBOUNCE_DELAY),
      });
    }
    const entry = State.writeQueue.get(fileUri);
    entry!.buffer = buffer;
    entry!.version = version;
    entry!.listeners.push(resolve);
    entry!.handler(fileUri);
  });
};

const writeFiles = async (
  files: { uri: string; version: number; data: ArrayBuffer }[],
) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data);
      return enqueueWrite(file.uri, file.version, buffer);
    }),
  );
  return result;
};

const write = async (fileUri: string) => {
  console.log(MAGENTA, "WRITE", fileUri);
  const queued = State.writeQueue.get(fileUri)!;
  const buffer = queued.buffer;
  const version = queued.version;
  const listeners = queued.listeners;
  const root = await navigator.storage.getDirectory();
  const relativePath = getPathFromUri(fileUri);
  const directoryPath = getParentPath(relativePath);
  const filename = getFileName(relativePath);
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  let created = false;
  try {
    await directoryHandle.getFileHandle(filename, { create: false });
  } catch (err) {
    // File does not exist yet
    created = true;
  }
  try {
    const fileHandle = await directoryHandle.getFileHandle(filename, {
      create: true,
    });
    const syncAccessHandle = await fileHandle.createSyncAccessHandle();
    syncAccessHandle.truncate(0);
    syncAccessHandle.write(buffer, { at: 0 });
    syncAccessHandle.flush();
    syncAccessHandle.close();
    const arrayBuffer = buffer.buffer as ArrayBuffer;
    const file = updateFileCache(fileUri, arrayBuffer, true, version);
    listeners.forEach((l) => {
      l({ file, created });
    });
    queued.listeners = [];
  } catch (err: any) {
    console.error(err, filename, fileUri, err.stack);
  }
};

const createFiles = async (files: (FileCreate & { data?: ArrayBuffer })[]) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data ?? new ArrayBuffer());
      return enqueueWrite(file.uri, 0, buffer);
    }),
  );
  return result;
};

const deleteFiles = async (files: { uri: string }[]) => {
  const root = await navigator.storage.getDirectory();
  return Promise.all(
    files.map(async (file) => {
      console.log(MAGENTA, "DELETE", file.uri);
      const relativePath = getPathFromUri(file.uri);
      const directoryPath = getParentPath(relativePath);
      const directoryHandle = await getDirectoryHandleFromPath(
        root,
        directoryPath,
      );
      directoryHandle.removeEntry(getFileName(relativePath));
      const existingFile = State.files.get(file.uri);
      if (existingFile) {
        URL.revokeObjectURL(existingFile.src);
        State.files.delete(file.uri);
      }
      return existingFile;
    }),
  );
};

const renameFiles = async (files: { oldUri: string; newUri: string }[]) => {
  const result = await Promise.all(
    files.map(async (f) => {
      console.log(MAGENTA, "RENAME", f.oldUri, f.newUri);
      const data = await readFile(f.oldUri);
      await deleteFiles([{ uri: f.oldUri }]);
      const r = await createFiles([{ uri: f.newUri, data }]);
      return r[0]!;
    }),
  );
  return result;
};

const getFileType = (uri: string): string => {
  if (State.scriptFilePattern?.test(uri)) {
    return "script";
  }
  if (State.imageFilePattern?.test(uri)) {
    return "image";
  }
  if (State.audioFilePattern?.test(uri)) {
    return "audio";
  }
  if (State.fontFilePattern?.test(uri)) {
    return "font";
  }
  return "text";
};

const getMimeType = (type: string, ext: string) => {
  const encoding = type === "text" ? "plain" : ext === "svg" ? "svg+xml" : ext;
  return `${type}/${encoding}`;
};

const updateFileCache = (
  uri: string,
  buffer: ArrayBuffer,
  overwrite: boolean,
  version?: number,
) => {
  const existingFile = State.files.get(uri);
  let src = existingFile?.src || "";
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);
  if (name) {
    if (!src || overwrite) {
      src = getSrcFromUri(uri) + `?v=${Date.now()}`;
    }
  }
  const text =
    type === "script" || type === "text" || ext === "svg"
      ? new TextDecoder("utf-8").decode(buffer)
      : undefined;

  const file = {
    uri,
    name,
    ext,
    type,
    src,
    version: version ?? existingFile?.version ?? 0,
    languageId: type === "script" ? LANGUAGE_ID : null,
    text,
  };
  State.files.set(uri, file);

  if (type === "script") {
    const content = (text ?? "").replace(NEWLINE_REGEX, "\n");
    if (!State.documents.get(uri)) {
      State.documents.set(
        uri,
        TextDocument.create(uri, LANGUAGE_ID, version ?? 0, content),
      );
    }
  }

  return file;
};
