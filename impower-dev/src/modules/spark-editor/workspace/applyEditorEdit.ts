import { ApplyEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  onProtocolMessage,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { WorkspaceEdit } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";

export interface EditorEditFiles {
  getFileText: (uri: string) => Promise<string>;
  applyWorkspaceEdit: (
    edit: WorkspaceEdit,
    label?: string,
    metadata?: { isRefactoring?: boolean },
  ) => Promise<{ applied: boolean; failureReason?: string }>;
}

type DocumentChange = NonNullable<WorkspaceEdit["documentChanges"]>[number];

const editedUri = (change: DocumentChange) =>
  "textDocument" in change ? change.textDocument.uri : undefined;

export const documentChangesOf = (edit: WorkspaceEdit): DocumentChange[] =>
  edit.documentChanges ??
  Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({
    textDocument: { uri, version: null },
    edits,
  }));

export const applyEditorEdit = async (
  files: EditorEditFiles,
  edit: WorkspaceEdit,
  label: string,
): Promise<{ applied: boolean; failureReason?: string }> => {
  const documentChanges = documentChangesOf(edit);
  const uris = [
    ...new Set(
      documentChanges.flatMap((c) => {
        const uri = editedUri(c);
        return uri ? [uri] : [];
      }),
    ),
  ];
  const closedTexts: Record<string, string> = {};
  await Promise.all(
    uris.map(async (uri) => {
      closedTexts[uri] = await files.getFileText(uri);
    }),
  );
  const request = ApplyEditorEditMessage.type.request({
    label,
    edit: { documentChanges },
    closedTexts,
  });
  const claimed = new Set<string>();
  const stop = onProtocolMessage(ClaimedEditorEditMessage.type, (message) => {
    if (message.params.request === request.id) {
      claimed.add(message.params.uri);
    }
  });
  try {
    sendProtocolMessage(request);
  } finally {
    stop();
  }
  const rest = documentChanges.filter((c) => {
    const uri = editedUri(c);
    return !uri || !claimed.has(uri);
  });
  if (!rest.length) {
    return { applied: true };
  }
  return files.applyWorkspaceEdit({ documentChanges: rest }, label, {
    isRefactoring: true,
  });
};
