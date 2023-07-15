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
import { getDirectoryPathEntries } from "./utils/getDirectoryPathEntries";
import { getDirectoryPathHandle } from "./utils/getDirectoryPathHandle";
import { getFilePathHandle } from "./utils/getFilePathHandle";
import { getParentPath } from "./utils/getParentPath";
import { getPathFromUri } from "./utils/getPathFromUri";

onmessage = async (e) => {
  const message = e.data;
  if (WorkspaceDirectory.isRequest(message)) {
    handleWorkspaceDirectory(message);
  }
  if (ReadTextDocument.isRequest(message)) {
    handleReadTextDocument(message);
  }
  if (WriteTextDocument.isRequest(message)) {
    handleWriteTextDocument(message);
  }
};

const handleWorkspaceDirectory = async (
  message: WorkspaceDirectoryRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { directory } = message.params;
  const relativePath = getPathFromUri(directory.uri);
  const directoryHandle = await getDirectoryPathHandle(root, relativePath);
  const parentPath = getParentPath(relativePath);
  const entries: WorkspaceEntry[] = [];
  const directoryEntries = await getDirectoryPathEntries(
    directoryHandle,
    parentPath
  );
  Object.values(directoryEntries).forEach((entry) => {
    entries.push({
      uri: entry.uri,
      name: entry.name,
      kind: entry.kind,
    });
  });
  postMessage(WorkspaceDirectory.response(message.id, entries));
};

const handleReadTextDocument = async (
  message: ReadTextDocumentRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { textDocument } = message.params;
  const relativePath = getPathFromUri(textDocument.uri);
  const fileHandle = await getFilePathHandle(root, relativePath);
  const syncAccessHandle = await fileHandle.createSyncAccessHandle();
  const fileSize = syncAccessHandle.getSize();
  const buffer = new DataView(new ArrayBuffer(fileSize));
  syncAccessHandle.read(buffer, { at: 0 });
  const decoder = new TextDecoder("utf-8");
  const text = decoder.decode(buffer);
  syncAccessHandle.flush();
  syncAccessHandle.close();
  postMessage(ReadTextDocument.response(message.id, text));
};

const handleWriteTextDocument = async (
  message: WriteTextDocumentRequestMessage
) => {
  const root = await navigator.storage.getDirectory();
  const { textDocument, text } = message.params;
  const relativePath = getPathFromUri(textDocument.uri);
  const fileHandle = await getFilePathHandle(root, relativePath);
  const syncAccessHandle = await fileHandle.createSyncAccessHandle();
  const encoder = new TextEncoder();
  const encodedText = encoder.encode(text);
  syncAccessHandle.truncate(0);
  syncAccessHandle.write(encodedText, { at: 0 });
  syncAccessHandle.flush();
  syncAccessHandle.close();
};
