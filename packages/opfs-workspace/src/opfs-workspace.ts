import { ReadTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/ReadTextDocumentMessage.js";
import { WriteTextDocumentMessage } from "@impower/spark-editor-protocol/src/protocols/textDocument/WriteTextDocumentMessage.js";
import { CreateFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/CreateFilesMessage.js";
import { DeleteFilesMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/DeleteFilesMessage.js";
import { ReadFileMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/ReadFileMessage.js";
import { WorkspaceDirectoryMessage } from "@impower/spark-editor-protocol/src/protocols/workspace/WorkspaceDirectoryMessage.js";
import { WorkspaceEntry } from "@impower/spark-editor-protocol/src/types";
import { getAllFiles } from "./utils/getAllFiles";
import { getDirectoryHandleFromPath } from "./utils/getDirectoryHandleFromPath";
import { getFileHandleFromUri } from "./utils/getFileHandleFromUri";
import { getFileName } from "./utils/getFileName";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";
import { getSyncAccessHandleFromUri } from "./utils/getSyncAccessHandleFromUri";
import { getUriFromPath } from "./utils/getUriFromPath";

class State {
  static syncing: Record<string, { handle: FileSystemSyncAccessHandle }> = {};
}

onmessage = async (e) => {
  const message = e.data;
  if (WorkspaceDirectoryMessage.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { directory } = message.params;
    const relativePath = getPathFromUri(directory.uri);
    const directoryHandle = await getDirectoryHandleFromPath(
      root,
      relativePath
    );
    const directoryPath =
      getParentPath(relativePath) + "/" + directoryHandle.name;
    const directoryEntries = await getAllFiles(directoryHandle, directoryPath);
    const entries: WorkspaceEntry[] = [];
    directoryEntries.forEach((entry) => {
      const uri = getUriFromPath(entry.path);
      entries.push({ uri });
    });
    postMessage(WorkspaceDirectoryMessage.type.response(message.id, entries));
  }
  if (ReadFileMessage.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { file } = message.params;
    const fileHandle = await getFileHandleFromUri(root, file.uri);
    const fileRef = await fileHandle.getFile();
    const buffer = await fileRef.arrayBuffer();
    const response = ReadFileMessage.type.response(message.id, buffer);
    postMessage(response, [response.result]);
  }
  if (ReadTextDocumentMessage.type.isRequest(message)) {
    const { textDocument } = message.params;
    const root = await navigator.storage.getDirectory();
    const fileHandle = await getFileHandleFromUri(root, textDocument.uri);
    const fileRef = await fileHandle.getFile();
    const buffer = await fileRef.arrayBuffer();
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    postMessage(ReadTextDocumentMessage.type.response(message.id, text));
  }
  if (WriteTextDocumentMessage.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { textDocument, text } = message.params;
    const existingSync = State.syncing[textDocument.uri];
    const syncAccessHandle =
      existingSync?.handle ||
      (await getSyncAccessHandleFromUri(root, textDocument.uri));
    State.syncing[textDocument.uri] = {
      handle: syncAccessHandle,
    };
    const encoder = new TextEncoder();
    const encodedText = encoder.encode(text);
    syncAccessHandle.truncate(0);
    syncAccessHandle.write(encodedText, { at: 0 });
    syncAccessHandle.flush();
    syncAccessHandle.close();
    delete State.syncing[textDocument.uri];
    postMessage(WriteTextDocumentMessage.type.response(message.id, null));
  }
  if (CreateFilesMessage.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { files } = message.params;
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
    postMessage(CreateFilesMessage.type.response(message.id, null));
  }
  if (DeleteFilesMessage.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { files } = message.params;
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
    postMessage(DeleteFilesMessage.type.response(message.id, null));
  }
};
