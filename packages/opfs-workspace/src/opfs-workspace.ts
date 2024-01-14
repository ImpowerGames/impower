import { ErrorCodes } from "@impower/spark-editor-protocol/src/enums/ErrorCodes";
import { FileChangeType } from "@impower/spark-editor-protocol/src/enums/FileChangeType";
import { DidParseTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/DidParseTextDocumentMessage.js";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage.js";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage.js";
import { DidChangeWatchedFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeWatchedFilesMessage.js";
import { DidCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidCreateFilesMessage.js";
import { DidDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidDeleteFilesMessage.js";
import { DidWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidWriteFileMessage.js";
import { ReadDirectoryFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadDirectoryFilesMessage.js";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage.js";
import { UnzipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/UnzipFilesMessage.js";
import { WillCreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillCreateFilesMessage.js";
import { WillDeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillDeleteFilesMessage.js";
import { WillWriteFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WillWriteFileMessage.js";
import { ZipFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ZipFilesMessage.js";
import { FileData } from "@impower/spark-editor-protocol/src/types";
import { Zippable, unzipSync, zipSync } from "fflate";
import GameParser from "../../spark-engine/src/parser/classes/GameParser";
import { STRUCT_DEFAULTS } from "../../spark-engine/src/parser/constants/STRUCT_DEFAULTS";
import { SparkVariable } from "../../sparkdown/src";
import debounce from "./utils/debounce";
import { getAllFilesRecursive } from "./utils/getAllFilesRecursive";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileExtension } from "./utils/getFileExtension";
import { getFileHandleFromUri } from "./utils/getFileHandleFromUri";
import { getFileName } from "./utils/getFileName";
import { getName } from "./utils/getName";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";
import { getUriFromPath } from "./utils/getUriFromPath";

const MAGENTA = "\x1b[35m%s\x1b[0m";

const WRITE_DEBOUNCE_DELAY = 100;

const globToRegex = (glob: string) => {
  return RegExp(
    glob
      .replace(/[.]/g, "[.]")
      .replace(/[*]/g, ".*")
      .replace(/[{](.*)[}]/g, (_match, $1) => `(${$1.replace(/[,]/g, "|")})`),
    "i"
  );
};

const parse = (file: FileData, files: FileData[]) => {
  if (file.text != null && file.name) {
    const variables: Record<string, SparkVariable> = {};
    files.forEach((file) => {
      if (file.name) {
        const obj = {
          uri: file.uri,
          name: file.name,
          src: file.src,
          ext: file.ext,
          type: file.type,
        };
        variables[file.type + "." + file.name] ??= {
          tag: "asset",
          line: -1,
          from: -1,
          to: -1,
          indent: 0,
          type: file.type,
          name: file.name,
          value: JSON.stringify(obj),
          compiled: obj,
          implicit: true,
        };
      }
    });
    const program = GameParser.parse(file.text, {
      augmentations: { builtins: STRUCT_DEFAULTS, variables },
    });
    return program;
  }
  return undefined;
};

class State {
  static writeQueue: Record<
    string,
    {
      handler: (uri: string) => void;
      version: number;
      buffer: DataView | Uint8Array;
      listeners: ((result: { data: FileData; created: boolean }) => void)[];
    }
  > = {};
  static imageFilePattern?: RegExp;
  static audioFilePattern?: RegExp;
  static scriptFilePattern?: RegExp;
  static files: Record<string, FileData> = {};
}

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
      files.forEach((file) => {
        const program = parse(file, files);
        if (program != null) {
          file.program = program;
          postMessage(
            DidParseTextDocumentMessage.type.notification({
              textDocument: { uri: file.uri, version: file.version },
              program,
            })
          );
        }
      });
      postMessage(ReadDirectoryFilesMessage.type.response(message.id, files));
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadDirectoryFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (ReadFileMessage.type.isRequest(message)) {
    try {
      const { file } = message.params;
      const buffer = await readFile(file.uri);
      const response = ReadFileMessage.type.response(message.id, buffer);
      postMessage(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ReadFileMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (ZipFilesMessage.type.isRequest(message)) {
    const { files } = message.params;
    try {
      const buffer = await zipFiles(files);
      const response = ZipFilesMessage.type.response(message.id, buffer);
      postMessage(response, [buffer]);
    } catch (err: any) {
      console.error(err, err.stack);
      const response = ZipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (UnzipFilesMessage.type.isRequest(message)) {
    try {
      const { data } = message.params;
      const files = await unzipFiles(data);
      const response = UnzipFilesMessage.type.response(message.id, files);
      postMessage(
        response,
        files.map(({ data }) => data)
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = UnzipFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (WillWriteFileMessage.type.isRequest(message)) {
    try {
      const { file } = message.params;
      const { uri, version, data } = file;
      const buffer = new DataView(data);
      const fileData = await writeFile(uri, version, buffer);
      if (fileData.text != null) {
        const files = Object.values(State.files);
        const program = parse(fileData, files);
        if (program) {
          fileData.program = program;
          postMessage(
            DidParseTextDocumentMessage.type.notification({
              textDocument: { uri, version: file.version },
              program,
            })
          );
        }
      }
      postMessage(WillWriteFileMessage.type.response(message.id, fileData));
      postMessage(DidWriteFileMessage.type.notification({ file: fileData }));
      postMessage(
        DidChangeWatchedFilesMessage.type.notification({
          changes: [
            {
              uri: fileData.uri,
              type: FileChangeType.Changed,
            },
          ],
        })
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillWriteFileMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (WillCreateFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const result = await createFiles(files);
      const fileDataArray = result.map((r) => r.data);
      postMessage(
        WillCreateFilesMessage.type.response(message.id, fileDataArray)
      );
      const createdResult = result.filter((r) => r.created);
      const changedResult = result.filter((r) => !r.created);
      if (createdResult.length > 0) {
        postMessage(
          DidCreateFilesMessage.type.notification({
            files: createdResult.map((r) => ({
              uri: r.data.uri,
            })),
          })
        );
      }
      if (changedResult.length > 0) {
        changedResult.forEach((change) => {
          postMessage(
            DidWriteFileMessage.type.notification({ file: change.data })
          );
        });
      }
      postMessage(
        DidChangeWatchedFilesMessage.type.notification({
          changes: result.map((r) => ({
            uri: r.data.uri,
            type: r.created ? FileChangeType.Created : FileChangeType.Changed,
          })),
        })
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillCreateFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
    }
  }
  if (WillDeleteFilesMessage.type.isRequest(message)) {
    try {
      const { files } = message.params;
      const deletedFiles = await deleteFiles(files);
      postMessage(
        WillDeleteFilesMessage.type.response(
          message.id,
          deletedFiles.filter((d): d is FileData => d != null)
        )
      );
      postMessage(DidDeleteFilesMessage.type.notification({ files }));
      postMessage(
        DidChangeWatchedFilesMessage.type.notification({
          changes: files.map((file) => ({
            uri: file.uri,
            type: FileChangeType.Deleted,
          })),
        })
      );
    } catch (err: any) {
      console.error(err, err.stack);
      const response = WillDeleteFilesMessage.type.error(message.id, {
        code: ErrorCodes.InternalError,
        message: err.message,
      });
      postMessage(response);
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
};

const readDirectoryFiles = async (directoryUri: string) => {
  const root = await navigator.storage.getDirectory();
  const directoryPath = getPathFromUri(directoryUri);
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  const directoryEntries = await getAllFilesRecursive(
    directoryHandle,
    directoryPath
  );
  const files = await Promise.all(
    directoryEntries.map(async (entry) => {
      const uri = getUriFromPath(entry.path);
      if (!State.files[uri]) {
        await readFile(uri);
      }
      return State.files[uri]!;
    })
  );
  return files;
};

const readFile = async (fileUri: string) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri);
  const fileRef = await fileHandle.getFile();
  const buffer = await fileRef.arrayBuffer();
  updateFileCache(fileUri, buffer, false);
  return buffer;
};

const zipFiles = async (files: { uri: string }[]) => {
  const root = await navigator.storage.getDirectory();
  const refs = await Promise.all(
    files.map(async ({ uri }) => {
      const fileHandle = await getFileHandleFromUri(root, uri);
      const fileRef = await fileHandle.getFile();
      const arrayBuffer = await fileRef.arrayBuffer();
      return { uri, name: fileRef.name, arrayBuffer };
    })
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
    "ZIP",
    `${refs.length} files (${formatBytes(zipped.buffer.byteLength)})`
  );
  return zipped.buffer;
};

const unzipFiles = async (data: ArrayBuffer) => {
  const unzipped = unzipSync(new Uint8Array(data));
  const files = Object.entries(unzipped).map(([filename, data]) => ({
    filename,
    data: data.buffer,
  }));
  console.log(MAGENTA, "UNZIP", `${files.length} files`);
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
    reader.readAsDataURL(new Blob([bytes], { type: mimeType }));
  });
};

const dataUrlToBytes = async (dataUrl: string) => {
  const res = await fetch(dataUrl);
  const arrayBuffer = await res.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

const enqueueWrite = async (
  fileUri: string,
  version: number,
  buffer: DataView | Uint8Array
) => {
  return new Promise<{ data: FileData; created: boolean }>((resolve) => {
    if (!State.writeQueue[fileUri]) {
      State.writeQueue[fileUri] = {
        buffer,
        version,
        listeners: [],
        handler: debounce(write, WRITE_DEBOUNCE_DELAY),
      };
    }
    const entry = State.writeQueue[fileUri];
    entry!.buffer = buffer;
    entry!.listeners.push(resolve);
    entry!.handler(fileUri);
  });
};

const writeFile = async (
  uri: string,
  version: number,
  buffer: DataView | Uint8Array
) => {
  const result = await enqueueWrite(uri, version, buffer);
  return result.data;
};

const write = async (fileUri: string) => {
  const queued = State.writeQueue[fileUri]!;
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
    const arrayBuffer = buffer.buffer;
    const data = updateFileCache(fileUri, arrayBuffer, true, version);
    listeners.forEach((l) => {
      l({ data, created });
    });
    queued.listeners = [];
    console.log(MAGENTA, "WRITE", fileUri);
  } catch (err) {
    console.error(err, filename, fileUri);
  }
};

const createFiles = async (files: { uri: string; data: ArrayBuffer }[]) => {
  const result = await Promise.all(
    files.map(async (file) => {
      const buffer = new DataView(file.data);
      return enqueueWrite(file.uri, 0, buffer);
    })
  );
  return result;
};

const deleteFiles = async (files: { uri: string }[]) => {
  const root = await navigator.storage.getDirectory();
  return Promise.all(
    files.map(async (file) => {
      const relativePath = getPathFromUri(file.uri);
      const directoryPath = getParentPath(relativePath);
      const directoryHandle = await getDirectoryHandleFromPath(
        root,
        directoryPath
      );
      directoryHandle.removeEntry(getFileName(relativePath));
      const existingFile = State.files[file.uri];
      if (existingFile) {
        URL.revokeObjectURL(existingFile.src);
        delete State.files[file.uri];
        console.log(MAGENTA, "DELETE", file.uri);
      }
      return existingFile;
    })
  );
};

const getType = (uri: string) => {
  return State.imageFilePattern?.test(uri)
    ? "image"
    : State.audioFilePattern?.test(uri)
    ? "audio"
    : State.scriptFilePattern?.test(uri)
    ? "script"
    : "text";
};

const getMimeType = (type: string, ext: string) => {
  const encoding = type === "text" ? "plain" : ext === "svg" ? "svg+xml" : ext;
  return `${type}/${encoding}`;
};

const updateFileCache = (
  uri: string,
  buffer: ArrayBuffer,
  overwrite: boolean,
  version?: number
) => {
  const existingFile = State.files[uri];
  let src = existingFile?.src;
  const name = getName(uri);
  const ext = getFileExtension(uri);
  const type = getType(uri);
  if (!src || overwrite) {
    if (src) {
      URL.revokeObjectURL(src);
    }
    src = URL.createObjectURL(
      new Blob([buffer], { type: getMimeType(type, ext) })
    );
  }
  const text =
    type === "script" || type === "text"
      ? new TextDecoder("utf-8").decode(buffer)
      : undefined;
  const program = existingFile?.program;
  const file = {
    uri,
    name,
    ext,
    type,
    src,
    version: version ?? existingFile?.version ?? 0,
    text,
    program,
  };
  State.files[uri] = file;
  return file;
};
