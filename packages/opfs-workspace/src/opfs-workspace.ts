import {
  DeleteTextDocument,
  DeleteTextDocumentRequestMessage,
} from "../../spark-editor-protocol/src/protocols/textDocument/messages/DeleteTextDocument";
import {
  ReadTextDocument,
  ReadTextDocumentRequestMessage,
} from "../../spark-editor-protocol/src/protocols/textDocument/messages/ReadTextDocument";
import {
  WriteTextDocument,
  WriteTextDocumentRequestMessage,
} from "../../spark-editor-protocol/src/protocols/textDocument/messages/WriteTextDocument";
import {
  WorkspaceDirectory,
  WorkspaceDirectoryRequestMessage,
} from "../../spark-editor-protocol/src/protocols/workspace/messages/WorkspaceDirectory";
import { WorkspaceEntry } from "../../spark-editor-protocol/src/types";
import { getDirectoryEntries } from "./utils/getDirectoryEntries";
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
    handleWorkspaceDirectory(message);
  }
  if (ReadTextDocument.type.isRequest(message)) {
    handleReadTextDocument(message);
  }
  if (WriteTextDocument.type.isRequest(message)) {
    handleWriteTextDocument(message);
  }
  if (DeleteTextDocument.type.isRequest(message)) {
    handleDeleteTextDocument(message);
  }
};

const handleWorkspaceDirectory = async (
  message: WorkspaceDirectoryRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { directory } = message.params;
  const relativePath = getPathFromUri(directory.uri);
  const directoryHandle = await getDirectoryHandleFromPath(root, relativePath);
  const parentPath = getParentPath(relativePath);
  const directoryEntries = await getDirectoryEntries(
    directoryHandle,
    parentPath
  );
  const entries: WorkspaceEntry[] = Object.values(directoryEntries)
    .map((entry) => ({
      uri: getUriFromPath(entry.path),
      name: entry.name,
      kind: entry.kind,
    }))
    .sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0));
  postMessage(WorkspaceDirectory.type.response(message.id, entries));
};

const handleReadTextDocument = async (
  message: ReadTextDocumentRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { textDocument } = message.params;
  const fileHandle = await getFileHandleFromUri(root, textDocument.uri);
  const file = await fileHandle.getFile();
  const buffer = await file.arrayBuffer();
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  postMessage(ReadTextDocument.type.response(message.id, text));
};

const handleWriteTextDocument = async (
  message: WriteTextDocumentRequestMessage
) => {
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
  postMessage(WriteTextDocument.type.response(message.id));
};

const handleDeleteTextDocument = async (
  message: DeleteTextDocumentRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { textDocument } = message.params;
  const relativePath = getPathFromUri(textDocument.uri);
  const directoryPath = getParentPath(relativePath);
  const directoryHandle = await getDirectoryHandleFromPath(root, directoryPath);
  directoryHandle.removeEntry(getFileName(relativePath));
  postMessage(DeleteTextDocument.type.response(message.id));
};
