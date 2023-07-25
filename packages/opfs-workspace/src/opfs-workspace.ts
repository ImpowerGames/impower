import { ReadTextDocument } from "../../spark-editor-protocol/src/protocols/textDocument/messages/ReadTextDocument";
import { WriteTextDocument } from "../../spark-editor-protocol/src/protocols/textDocument/messages/WriteTextDocument";
import { CreateFiles } from "../../spark-editor-protocol/src/protocols/workspace/messages/CreateFiles";
import { DeleteFiles } from "../../spark-editor-protocol/src/protocols/workspace/messages/DeleteFiles";
import { ReadFile } from "../../spark-editor-protocol/src/protocols/workspace/messages/ReadFile";
import { WorkspaceDirectory } from "../../spark-editor-protocol/src/protocols/workspace/messages/WorkspaceDirectory";
import { WorkspaceEntry } from "../../spark-editor-protocol/src/types";
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
  if (WorkspaceDirectory.type.isRequest(message)) {
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
    postMessage(WorkspaceDirectory.type.response(message.id, entries));
  }
  if (ReadFile.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { file } = message.params;
    const fileHandle = await getFileHandleFromUri(root, file.uri);
    const fileRef = await fileHandle.getFile();
    const buffer = await fileRef.arrayBuffer();
    const response = ReadFile.type.response(message.id, buffer);
    postMessage(response, [response.result]);
  }
  if (ReadTextDocument.type.isRequest(message)) {
    const root = await navigator.storage.getDirectory();
    const { textDocument } = message.params;
    const fileHandle = await getFileHandleFromUri(root, textDocument.uri);
    const fileRef = await fileHandle.getFile();
    const buffer = await fileRef.arrayBuffer();
    const decoder = new TextDecoder("utf-8");
    const text = decoder.decode(buffer);
    postMessage(ReadTextDocument.type.response(message.id, text));
  }
  if (WriteTextDocument.type.isRequest(message)) {
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
    postMessage(WriteTextDocument.type.response(message.id, null));
  }
  if (CreateFiles.type.isRequest(message)) {
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
    postMessage(CreateFiles.type.response(message.id, null));
  }
  if (DeleteFiles.type.isRequest(message)) {
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
    postMessage(DeleteFiles.type.response(message.id, null));
  }
};
