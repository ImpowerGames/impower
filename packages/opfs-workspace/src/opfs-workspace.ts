import { ErrorCodes } from "@impower/spark-editor-protocol/src/enums/ErrorCodes";
import { normalizeSVGAttributeNames } from "@impower/sparkdown/src/attributes";
import { getOrCreateThumbnail } from "@impower/sparkdown/src/thumbnails/composeThumbnail";
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
import {
  TrashFilesMessage,
  TrashFilesResult,
} from "@impower/spark-editor-protocol/src/protocols/workspace/TrashFilesMessage";
import { TrashBatch } from "@impower/spark-editor-protocol/src/types/workspace/TrashBatch";
import { WillWriteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFilesMessage";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage";
import {
  AnnotatedTextEdit,
  CreateFile,
  DeleteFile,
  FileCreate,
  FileData,
  FileEvent,
  RenameFile,
  TextDocumentEdit,
  TextEdit,
} from "@impower/spark-editor-protocol/src/types";
import { NotificationMessage } from "@impower/spark-editor-protocol/src/types/base/NotificationMessage";
import { ResponseMessage } from "@impower/spark-editor-protocol/src/types/base/ResponseMessage";
import { unzipSync, zipSync } from "fflate";
import {
  TextDocument,
  TextDocumentContentChangeEvent,
} from "vscode-languageserver-textdocument";
import { buildZippable, parseUnzipEntries } from "./utils/assetArchive";
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

const languageIdOf = (uri: string): string =>
  uri.endsWith(".luau") ? "luau" : LANGUAGE_ID;

const TRASH_DIR = ".trash";
const TRASH_MANIFEST = "__manifest.json";
const DEFAULT_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

const THUMB_CACHE_NAME = "asset-thumbnails";
const THUMB_WIDTH = 144;
const RESOURCE_PROTOCOL = "/file:/";
const RASTER_IMAGE_REGEX = /[.](png|jpe?g|gif|webp)$/i;
const THUMBNAILS_SUPPORTED =
  typeof createImageBitmap === "function" &&
  typeof OffscreenCanvas === "function" &&
  typeof caches !== "undefined";

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
  static videoFilePattern?: RegExp;
  static fontFilePattern?: RegExp;
  static scriptFilePattern?: RegExp;
  static writeQueue = new Map<
    string,
    {
      handler: (uri: string) => void;
      version: number;
      buffer: DataView | Uint8Array;
      writing?: boolean;
      listeners: { resolve(result: { file: FileData; created: boolean }): void; reject(error: unknown): void }[];
    }
  >();
  static files = new Map<string, FileData>();
  static documents = new Map<string, TextDocument>();
}

const channel = new BroadcastChannel("opfs-workspace");
channel.onmessage = (event) => {
  postMessage(event.data);
};
const broadcast = (message: NotificationMessage<string, object>) => {
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
      const { files, mode } = message.params;
      let removed = files;
      let deletedFiles;
      let failure: PromiseRejectedResult | undefined;
      if (mode === "trash") {
        deletedFiles = await moveFilesToTrash(files);
      } else {
        const outcomes = await Promise.allSettled(files.map(file => deleteFiles([file])));
        removed = files.filter((_file, index) => outcomes[index]?.status === "fulfilled");
        deletedFiles = outcomes.flatMap(outcome => outcome.status === "fulfilled" ? outcome.value : []);
        failure = outcomes.find((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
      }
      if (removed.length) {
        broadcast(DidDeleteFilesMessage.type.notification({ files: removed }));
        broadcast(DidChangeWatchedFilesMessage.type.notification({
          changes: removed.map(file => ({ uri: file.uri, type: FileChangeType.Deleted })),
        }));
      }
      if (failure) throw failure.reason;
      respond(WillDeleteFilesMessage.type.response(message.id, deletedFiles.filter((d): d is FileData => d != null)));
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillDeleteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      respond(response);
    }
  }
  if (TrashFilesMessage.type.isRequest(message)) {
    try {
      const { projectId, action, batchId, retentionMs } = message.params;
      let result: TrashFilesResult = {};
      if (action === "list") {
        result = { batches: await listTrash(projectId) };
      } else if (action === "restore" && batchId) {
        result = { restored: await restoreTrashBatch(projectId, batchId) };
      } else if (action === "deleteBatch" && batchId) {
        await removeTrashBatch(projectId, batchId);
      } else if (action === "empty") {
        await emptyTrash(projectId);
      } else if (action === "purge") {
        await purgeExpiredTrash(
          projectId,
          retentionMs ?? DEFAULT_TRASH_RETENTION_MS,
        );
      }
      respond(TrashFilesMessage.type.response(message.id, result));
      if (action === "restore" && result.restored && result.restored.length > 0) {
        broadcast(
          DidWriteFilesMessage.type.notification({
            files: result.restored,
            remote: false,
          }),
        );
        broadcast(
          DidChangeWatchedFilesMessage.type.notification({
            changes: result.restored.map((f) => ({
              uri: f.uri,
              type: FileChangeType.Changed,
            })),
          }),
        );
      }
    } catch (err: any) {
      console.error(err, err.stack);
      respond(
        TrashFilesMessage.type.error(message.id, {
          code: ErrorCodes.InternalError,
          message: err.message,
        }),
      );
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
  const videoFiles = settings?.videoFiles;
  if (videoFiles) {
    State.videoFilePattern = globToRegex(videoFiles);
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
    [TRASH_DIR],
  );
  const files = await Promise.all(
    directoryEntries.map(async (entry) => {
      const uri = getUriFromPath(entry.path);
      if (!State.files.get(uri)) {
        if (needsTextAtEnumeration(uri)) {
          await readFile(uri);
        } else {
          await statFile(uri);
        }
      }
      return State.files.get(uri)!;
    }),
  );
  return files;
};

const needsTextAtEnumeration = (fileUri: string) => {
  const ext = getFileExtension(fileUri);
  const type = getFileType(fileUri);
  return type === "script" || type === "text" || ext === "svg" || ext === "url";
};

const statFile = async (fileUri: string) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri, false);
  const fileRef = await fileHandle.getFile();
  return updateFileMetaCache(fileUri, fileRef.size, fileRef.lastModified);
};

const readFile = async (fileUri: string) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri, false);
  const fileRef = await fileHandle.getFile();
  const buffer = await fileRef.arrayBuffer();
  updateFileCache(fileUri, buffer, false, undefined, fileRef.lastModified);
  await enrichUrlAssetType(fileUri);
  return buffer;
};

const zipFiles = async (files: { uri: string; path?: string }[]) => {
  const root = await navigator.storage.getDirectory();
  const refs = await Promise.all(
    files.map(async ({ uri, path }) => {
      const fileHandle = await getFileHandleFromUri(root, uri, false);
      const fileRef = await fileHandle.getFile();
      const data = await fileRef.arrayBuffer();
      return { path: path || fileRef.name, data };
    }),
  );
  const zipped = zipSync(buildZippable(refs), {
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
  const files = parseUnzipEntries(unzipped);
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
      const changes = textDocumentEdit.edits.filter(
        (e): e is TextEdit | AnnotatedTextEdit => "newText" in e,
      );
      if (changes.length === 0) {
        return {
          file: { uri: td.uri } as FileData,
          created: false,
        };
      }
      let syncedDocument = State.documents.get(td.uri);
      if (!syncedDocument) {
        throw new Error(`File does not exist: ${td.uri}`);
      }
      const latestText = State.files.get(td.uri)?.text;
      if (
        latestText != null &&
        latestText.replace(NEWLINE_REGEX, "\n") !== syncedDocument.getText()
      ) {
        syncedDocument = TextDocument.create(
          td.uri,
          languageIdOf(td.uri),
          syncedDocument.version,
          latestText.replace(NEWLINE_REGEX, "\n"),
        );
        State.documents.set(td.uri, syncedDocument);
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
  immediate = false,
) => {
  if (/\.svg$/i.test(fileUri)) {
    const source = new TextDecoder().decode(buffer);
    const normalized = normalizeSVGAttributeNames(source);
    if (normalized !== source) buffer = new TextEncoder().encode(normalized);
  }
  return new Promise<{ file: FileData; created: boolean }>((resolve, reject) => {
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
    entry!.listeners.push({ resolve, reject });
    if (immediate) void write(fileUri);
    else entry!.handler(fileUri);
  });
};

let thumbnailChain: Promise<void> = Promise.resolve();

const enqueueThumbnail = (fileUri: string): Promise<void> => {
  if (!THUMBNAILS_SUPPORTED || !RASTER_IMAGE_REGEX.test(fileUri)) {
    return Promise.resolve();
  }
  thumbnailChain = thumbnailChain
    .then(() => generateThumbnail(fileUri))
    .catch(() => undefined);
  return thumbnailChain;
};

const generateThumbnail = async (fileUri: string): Promise<void> => {
  const root = await navigator.storage.getDirectory();
  const relativePath = getPathFromUri(fileUri);
  const directoryPath = getParentPath(relativePath);
  const filename = getFileName(relativePath);
  let file: File;
  try {
    const directoryHandle = await getDirectoryHandleFromPath(
      root,
      directoryPath,
    );
    const fileHandle = await directoryHandle.getFileHandle(filename, {
      create: false,
    });
    file = await fileHandle.getFile();
  } catch {
    return;
  }
  const cache = await caches.open(THUMB_CACHE_NAME);
  await getOrCreateThumbnail(
    cache,
    relativePath,
    file,
    String(THUMB_WIDTH),
    RESOURCE_PROTOCOL,
  );
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
  if (queued.writing || !queued.listeners.length) return;
  queued.writing = true;
  const buffer = queued.buffer;
  const version = queued.version;
  const listeners = queued.listeners.splice(0);
  const relativePath = getPathFromUri(fileUri);
  const directoryPath = getParentPath(relativePath);
  const filename = getFileName(relativePath);
  let directoryHandle: FileSystemDirectoryHandle | undefined;
  let syncAccessHandle: FileSystemSyncAccessHandle | undefined;
  let created = false;
  try {
    const root = await navigator.storage.getDirectory();
    directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
    let missing = false;
    try {
      await directoryHandle.getFileHandle(filename, { create: false });
    } catch (err) {
      if ((err as DOMException).name !== "NotFoundError") throw err;
      missing = true;
    }
    const fileHandle = await directoryHandle.getFileHandle(filename, {
      create: true,
    });
    created = missing;
    syncAccessHandle = await fileHandle.createSyncAccessHandle();
    syncAccessHandle.truncate(0);
    const written = syncAccessHandle.write(buffer, { at: 0 });
    if (written !== buffer.byteLength) throw new Error(`Wrote ${written} of ${buffer.byteLength} bytes`);
    syncAccessHandle.flush();
    syncAccessHandle.close();
    syncAccessHandle = undefined;
    const arrayBuffer = buffer.buffer as ArrayBuffer;
    const file = updateFileCache(fileUri, arrayBuffer, true, version, Date.now());
    await enrichUrlAssetType(fileUri);
    const notifyFile = State.files.get(fileUri) ?? file;
    await enqueueThumbnail(fileUri);
    listeners.forEach((l) => {
      l.resolve({ file: notifyFile, created });
    });
  } catch (err: any) {
    let failure = err;
    try {
      syncAccessHandle?.close();
      if (created) await directoryHandle?.removeEntry(filename);
    } catch (cleanupError) {
      failure = new Error(`${String(err)}; cleanup failed: ${String(cleanupError)}`);
    }
    listeners.forEach((listener) => listener.reject(failure));
  } finally {
    queued.writing = false;
    if (queued.listeners.length) queued.handler(fileUri);
  }
};

const createFiles = async (files: (FileCreate & { data?: ArrayBuffer })[]) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data ?? new ArrayBuffer());
      return enqueueWrite(file.uri, 0, buffer, true);
    }),
  );
  return result;
};

const moveFilesToTrash = async (files: { uri: string }[]) => {
  const deleted: (FileData | undefined)[] = [];
  if (files.length === 0) {
    return deleted;
  }
  const seen = new Set<string>();
  const uniqueFiles = files.filter((f) =>
    seen.has(f.uri) ? false : (seen.add(f.uri), true),
  );
  const projectId = getPathFromUri(uniqueFiles[0]!.uri).split("/")[0]!;
  const deletedAt = Date.now();
  const batchId = `${deletedAt}__${crypto.randomUUID()}`;
  const trashPrefix = `${projectId}/${TRASH_DIR}/${batchId}`;
  const entries: { relPath: string; originalUri: string; type: string }[] = [];
  for (const file of uniqueFiles) {
    try {
      const relPath = getPathFromUri(file.uri).slice(projectId.length + 1);
      const existing = State.files.get(file.uri);
      const type = existing?.type ?? getFileType(file.uri);
      const data = await readFile(file.uri);
      const trashUri = getUriFromPath(`${trashPrefix}/${relPath}`);
      await createFiles([{ uri: trashUri, data }]);
      await deleteFiles([{ uri: file.uri }]);
      entries.push({ relPath, originalUri: file.uri, type });
      deleted.push(existing);
    } catch (e) {
      console.error(`moveFilesToTrash: skipping ${file.uri}`, e);
    }
  }
  const manifest = JSON.stringify({ deletedAt, entries });
  const manifestUri = getUriFromPath(`${trashPrefix}/${TRASH_MANIFEST}`);
  await createFiles([
    {
      uri: manifestUri,
      data: new TextEncoder().encode(manifest).buffer as ArrayBuffer,
    },
  ]);
  return deleted;
};

const getTrashDirHandle = async (projectId: string) =>
  getDirectoryHandleFromPath(
    await navigator.storage.getDirectory(),
    `${projectId}/${TRASH_DIR}`,
  );

const evictTrashCache = (uriPrefix: string) => {
  for (const uri of [...State.files.keys()]) {
    if (uri.startsWith(uriPrefix)) {
      State.files.delete(uri);
    }
  }
};

const listTrash = async (projectId: string): Promise<TrashBatch[]> => {
  const trash = await getTrashDirHandle(projectId);
  const batches: TrashBatch[] = [];
  // @ts-ignore - values() exists
  for await (const handle of trash.values()) {
    if (handle.kind !== "directory") {
      continue;
    }
    try {
      const dir = handle as FileSystemDirectoryHandle;
      const file = await (await dir.getFileHandle(TRASH_MANIFEST)).getFile();
      const m = JSON.parse(await file.text()) as Omit<TrashBatch, "batchId">;
      batches.push({ batchId: handle.name, deletedAt: m.deletedAt, entries: m.entries });
    } catch {
    }
  }
  batches.sort((a, b) => b.deletedAt - a.deletedAt);
  return batches;
};

const removeTrashBatch = async (projectId: string, batchId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/${batchId}/`));
  const trash = await getTrashDirHandle(projectId);
  await trash.removeEntry(batchId, { recursive: true }).catch(() => {});
};

const fileExists = async (uri: string): Promise<boolean> => {
  try {
    const root = await navigator.storage.getDirectory();
    await getFileHandleFromUri(root, uri, false);
    return true;
  } catch {
    return false;
  }
};

const deconflictRestoreUri = async (uri: string): Promise<string> => {
  const path = getPathFromUri(uri);
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash + 1) : "";
  const file = slash >= 0 ? path.slice(slash + 1) : path;
  const dot = file.lastIndexOf(".");
  const base = dot > 0 ? file.slice(0, dot) : file;
  const ext = dot > 0 ? file.slice(dot) : "";
  for (let i = 1; ; i++) {
    const suffix = i === 1 ? " (restored)" : ` (restored ${i})`;
    const candidate = getUriFromPath(`${dir}${base}${suffix}${ext}`);
    if (!(await fileExists(candidate))) {
      return candidate;
    }
  }
};

const restoreTrashBatch = async (
  projectId: string,
  batchId: string,
): Promise<FileData[]> => {
  const trash = await getTrashDirHandle(projectId);
  let batchHandle: FileSystemDirectoryHandle;
  try {
    batchHandle = await trash.getDirectoryHandle(batchId);
  } catch {
    return [];
  }
  const manifestFile = await (
    await batchHandle.getFileHandle(TRASH_MANIFEST)
  ).getFile();
  const m = JSON.parse(await manifestFile.text()) as {
    entries: { relPath: string; originalUri: string }[];
  };
  const restored: FileData[] = [];
  const trashPrefix = `${projectId}/${TRASH_DIR}/${batchId}`;
  for (const entry of m.entries) {
    const data = await readFile(getUriFromPath(`${trashPrefix}/${entry.relPath}`));
    const targetUri = (await fileExists(entry.originalUri))
      ? await deconflictRestoreUri(entry.originalUri)
      : entry.originalUri;
    const [created] = await createFiles([{ uri: targetUri, data }]);
    if (created?.file) {
      restored.push(created.file);
    }
  }
  await removeTrashBatch(projectId, batchId);
  return restored;
};

const emptyTrash = async (projectId: string) => {
  evictTrashCache(getUriFromPath(`${projectId}/${TRASH_DIR}/`));
  const proj = await getDirectoryHandleFromPath(
    await navigator.storage.getDirectory(),
    projectId,
  );
  await proj.removeEntry(TRASH_DIR, { recursive: true }).catch(() => {});
};

const purgeExpiredTrash = async (projectId: string, retentionMs: number) => {
  const trash = await getTrashDirHandle(projectId);
  const cutoff = Date.now() - retentionMs;
  const expired: string[] = [];
  // @ts-ignore - values() exists
  for await (const handle of trash.values()) {
    if (handle.kind !== "directory") {
      continue;
    }
    const deletedAt = Number(handle.name.split("__")[0]);
    if (Number.isFinite(deletedAt) && deletedAt < cutoff) {
      expired.push(handle.name);
    }
  }
  for (const batchId of expired) {
    await removeTrashBatch(projectId, batchId);
  }
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
      await directoryHandle.removeEntry(getFileName(relativePath));
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
  if (State.videoFilePattern?.test(uri)) {
    return "video";
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

const headTypeCache = new Map<string, string>();

const categoryFromContentType = (contentType: string): string => {
  const t = (contentType.split(";")[0] || "").trim().toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  if (t.startsWith("font/") || t.includes("font")) return "font";
  if (t.startsWith("text/")) return "text";
  return "";
};

const resolveUrlTypeViaHead = async (url: string): Promise<string> => {
  const cached = headTypeCache.get(url);
  if (cached !== undefined) {
    return cached;
  }
  let category = "";
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url, { method: "HEAD", signal: controller.signal });
    clearTimeout(timer);
    category = categoryFromContentType(res.headers.get("content-type") || "");
  } catch {
    category = "";
  }
  headTypeCache.set(url, category);
  return category;
};

const enrichUrlAssetType = async (uri: string): Promise<void> => {
  if (getFileExtension(uri) !== "url") {
    return;
  }
  const file = State.files.get(uri);
  const url = (file?.text || "").trim();
  if (!file || !url) {
    return;
  }
  const urlPath = url.split(/[?#]/)[0] || "";
  if (getFileExtension(urlPath)) {
    return;
  }
  const category = await resolveUrlTypeViaHead(url);
  if (category && State.files.get(uri) === file) {
    file.type = category;
    State.files.set(uri, file);
  }
};

const updateFileMetaCache = (
  uri: string,
  size: number,
  modified?: number,
  version?: number,
) => {
  const existingFile = State.files.get(uri);
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);
  const resolvedModified = modified ?? existingFile?.modified ?? Date.now();
  let src = existingFile?.src || "";
  if (name && !src) {
    src = getSrcFromUri(uri) + `?v=${resolvedModified}-${size}`;
  }
  const file = {
    uri,
    name,
    ext,
    type,
    src,
    version: version ?? existingFile?.version ?? 0,
    size,
    modified: resolvedModified,
    languageId: type === "script" ? languageIdOf(uri) : null,
    text: existingFile?.text,
  };
  State.files.set(uri, file);
  return file;
};

const updateFileCache = (
  uri: string,
  buffer: ArrayBuffer,
  overwrite: boolean,
  version?: number,
  modified?: number,
) => {
  const existingFile = State.files.get(uri);
  let src = existingFile?.src || "";
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getFileType(uri);

  if (ext === "url") {
    const url = new TextDecoder("utf-8").decode(buffer).trim();
    const urlPath = url.split(/[?#]/)[0] || "";
    const urlExt = getFileExtension(urlPath);
    const headType = !urlExt ? headTypeCache.get(url) : undefined;
    const file = {
      uri,
      name,
      ext: urlExt || ext,
      type: url ? headType || getFileType(urlPath) : type,
      src: url,
      version: version ?? existingFile?.version ?? 0,
      languageId: null,
      text: url,
      size: buffer.byteLength,
      modified: modified ?? existingFile?.modified ?? Date.now(),
    };
    State.files.set(uri, file);
    return file;
  }

  const resolvedModified = modified ?? existingFile?.modified ?? Date.now();
  if (name) {
    if (!src || overwrite) {
      src = getSrcFromUri(uri) + `?v=${resolvedModified}-${buffer.byteLength}`;
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
    size: buffer.byteLength,
    modified: resolvedModified,
    languageId: type === "script" ? languageIdOf(uri) : null,
    text,
  };
  State.files.set(uri, file);

  if (type === "script") {
    const content = (text ?? "").replace(NEWLINE_REGEX, "\n");
    if (!State.documents.get(uri)) {
      State.documents.set(
        uri,
        TextDocument.create(uri, languageIdOf(uri), version ?? 0, content),
      );
    }
  }

  return file;
};
