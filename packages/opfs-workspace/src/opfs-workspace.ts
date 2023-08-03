import { ReadTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/ReadTextDocumentMessage.js";
import { WriteTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/WriteTextDocumentMessage.js";
import { BuildFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/BuildFilesMessage.js";
import { ConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ConfigurationMessage.js";
import { CreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/CreateFilesMessage.js";
import { DeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DeleteFilesMessage.js";
import { DidChangeConfigurationMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DidChangeConfigurationMessage.js";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage.js";
import { WorkspaceDirectoryMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WorkspaceDirectoryMessage.js";
import { WorkspaceEntry } from "@impower/spark-editor-protocol/src/types";
import EngineSparkParser from "../../spark-engine/src/parser/classes/EngineSparkParser";
import { SparkProgram } from "../../sparkdown/src/types/SparkProgram";
import { getAllFiles } from "./utils/getAllFiles";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileExtension } from "./utils/getFileExtension";
import { getFileHandleFromUri } from "./utils/getFileHandleFromUri";
import { getFileName } from "./utils/getFileName";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";
import { getSyncAccessHandleFromUri } from "./utils/getSyncAccessHandleFromUri";
import { getUriFromPath } from "./utils/getUriFromPath";

const globToRegex = (glob: string) => {
  return RegExp(glob.replace(/[.]/g, "[.]").replace(/[*]/g, ".*"), "i");
};

class State {
  static syncing: Record<string, { handle: FileSystemSyncAccessHandle }> = {};
  static scriptFilePattern: RegExp[] = [];
  static imageFilePattern: RegExp[] = [];
  static audioFilePattern: RegExp[] = [];
  static urls: string[] = [];
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
  if (WorkspaceDirectoryMessage.type.isRequest(message)) {
    const { directory } = message.params;
    const entries = await listFiles(directory.uri);
    postMessage(WorkspaceDirectoryMessage.type.response(message.id, entries));
  }
  if (ReadFileMessage.type.isRequest(message)) {
    const { file } = message.params;
    const buffer = await readFile(file.uri);
    const response = ReadFileMessage.type.response(message.id, buffer);
    postMessage(response, [response.result]);
  }
  if (ReadTextDocumentMessage.type.isRequest(message)) {
    const { textDocument } = message.params;
    const text = await readTextDocument(textDocument.uri);
    postMessage(ReadTextDocumentMessage.type.response(message.id, text));
  }
  if (WriteTextDocumentMessage.type.isRequest(message)) {
    const { textDocument, text } = message.params;
    await writeTextDocument(textDocument.uri, text);
    postMessage(WriteTextDocumentMessage.type.response(message.id, null));
  }
  if (CreateFilesMessage.type.isRequest(message)) {
    const { files } = message.params;
    await createFiles(files);
    postMessage(CreateFilesMessage.type.response(message.id, null));
  }
  if (DeleteFilesMessage.type.isRequest(message)) {
    const { files } = message.params;
    await deleteFiles(files);
    postMessage(DeleteFilesMessage.type.response(message.id, null));
  }
  if (BuildFilesMessage.type.isRequest(message)) {
    const { files } = message.params;
    const result = await buildFiles(files);
    postMessage(BuildFilesMessage.type.response(message.id, result));
  }
};

const loadConfiguration = (settings: any) => {
  const scriptFiles = settings?.scriptFiles;
  if (scriptFiles) {
    State.scriptFilePattern = scriptFiles.map((glob: string) =>
      globToRegex(glob)
    );
  }
  const imageFiles = settings?.imageFiles;
  if (imageFiles) {
    State.imageFilePattern = imageFiles.map((glob: string) =>
      globToRegex(glob)
    );
  }
  const audioFiles = settings?.audioFiles;
  if (audioFiles) {
    State.audioFilePattern = audioFiles.map((glob: string) =>
      globToRegex(glob)
    );
  }
};

const listFiles = async (directoryUri: string) => {
  const root = await navigator.storage.getDirectory();
  const relativePath = getPathFromUri(directoryUri);
  const directoryHandle = await getDirectoryHandleFromPath(root, relativePath);
  const directoryPath =
    getParentPath(relativePath) + "/" + directoryHandle.name;
  const directoryEntries = await getAllFiles(directoryHandle, directoryPath);
  const entries: WorkspaceEntry[] = [];
  directoryEntries.forEach((entry) => {
    const uri = getUriFromPath(entry.path);
    entries.push({ uri });
  });
  return entries;
};

const readFile = async (fileUri: string) => {
  const root = await navigator.storage.getDirectory();
  const fileHandle = await getFileHandleFromUri(root, fileUri);
  const fileRef = await fileHandle.getFile();
  const buffer = await fileRef.arrayBuffer();
  return buffer;
};

const readTextDocument = async (fileUri: string) => {
  const buffer = await readFile(fileUri);
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  return text;
};

const writeTextDocument = async (fileUri: string, text: string) => {
  const root = await navigator.storage.getDirectory();
  const existingSync = State.syncing[fileUri];
  const syncAccessHandle =
    existingSync?.handle || (await getSyncAccessHandleFromUri(root, fileUri));
  State.syncing[fileUri] = {
    handle: syncAccessHandle,
  };
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(text);
  syncAccessHandle.truncate(0);
  syncAccessHandle.write(encodedText, { at: 0 });
  syncAccessHandle.flush();
  syncAccessHandle.close();
  delete State.syncing[fileUri];
  return text;
};

const createFiles = async (files: { uri: string; data: ArrayBuffer }[]) => {
  const root = await navigator.storage.getDirectory();
  await Promise.all(
    files.map(async (file) => {
      const existingSync = State.syncing[file.uri];
      const syncAccessHandle =
        existingSync?.handle ||
        (await getSyncAccessHandleFromUri(root, file.uri));
      State.syncing[file.uri] = {
        handle: syncAccessHandle,
      };
      syncAccessHandle.truncate(0);
      const buffer = new DataView(file.data);
      syncAccessHandle.write(buffer, { at: 0 });
      syncAccessHandle.flush();
      syncAccessHandle.close();
      delete State.syncing[file.uri];
    })
  );
};

const deleteFiles = async (files: { uri: string }[]) => {
  const root = await navigator.storage.getDirectory();
  await Promise.all(
    files.map(async (file) => {
      const relativePath = getPathFromUri(file.uri);
      const directoryPath = getParentPath(relativePath);
      const directoryHandle = await getDirectoryHandleFromPath(
        root,
        directoryPath
      );
      directoryHandle.removeEntry(getFileName(relativePath));
    })
  );
};

const isScriptFile = (uri: string) => {
  return State.scriptFilePattern.some((regexp) => regexp.test(uri));
};

const isImageFile = (uri: string) => {
  return State.imageFilePattern.some((regexp) => regexp.test(uri));
};

const isAudioFile = (uri: string) => {
  return State.audioFilePattern.some((regexp) => regexp.test(uri));
};

const getFileType = (uri: string) => {
  return isImageFile(uri)
    ? "image"
    : isAudioFile(uri)
    ? "audio"
    : isScriptFile(uri)
    ? "script"
    : "text";
};

const buildFiles = async (files: { uri: string }[]) => {
  State.urls.forEach((url) => {
    // Revoke old urls to prevent memory leak.
    URL.revokeObjectURL(url);
  });
  State.urls = [];
  const chunks: {
    uri: string;
    name: string;
    src: string;
    ext: string;
    type: string;
    text?: string;
  }[] = await Promise.all(
    files.map(async (file) => {
      const uri = file.uri;
      const name = getFileName(uri).split(".")[0]!;
      const ext = getFileExtension(uri);
      const type = getFileType(uri);
      const buffer = await readFile(uri);
      const src = URL.createObjectURL(new Blob([buffer]));
      if (isScriptFile(uri)) {
        const decoder = new TextDecoder("utf-8");
        const text = decoder.decode(buffer);
        return {
          uri,
          name,
          src,
          ext,
          type,
          text,
        };
      } else {
        State.urls.push(src);
        return {
          uri,
          name,
          src,
          ext,
          type,
        };
      }
    })
  );
  const programs: { uri: string; name: string; program: SparkProgram }[] = [];
  chunks.forEach((chunk) => {
    if (chunk.text != null) {
      const program = EngineSparkParser.instance.parse(chunk.text, {
        augmentations: { files: chunks },
      });
      programs.push({ uri: chunk.uri, name: chunk.name, program });
    }
  });
  return {
    programs,
  };
};
