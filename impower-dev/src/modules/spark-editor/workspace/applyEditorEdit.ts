import {
  ApplyEditorEditMessage,
  type ApplyEditorEditParams,
  type EditorFix,
  type EditorFixRevert,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
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

type FixRequest = Omit<ApplyEditorEditParams, "edit" | "closedTexts">;

export type EditorFixOutcome = "applied" | "refused" | "unclaimed";

const EDITOR_FIX_TIMEOUT = 3000;

const requestEditorFix = (
  uri: string,
  params: FixRequest,
): Promise<{
  outcome: EditorFixOutcome;
  id: number | string;
  revert?: EditorFixRevert;
}> => {
  const request = ApplyEditorEditMessage.type.request({
    ...params,
    edit: {},
  });
  let claimed = false;
  return new Promise((resolve) => {
    const finish = (outcome: EditorFixOutcome, revert?: EditorFixRevert) => {
      clearTimeout(timer);
      stopResponse();
      resolve({ outcome, id: request.id, revert });
    };
    const timer = setTimeout(() => finish("refused"), EDITOR_FIX_TIMEOUT);
    const stopResponse = onProtocolMessage(
      {
        is: (m: unknown): m is ApplyEditorEditMessage.Response =>
          ApplyEditorEditMessage.type.isResponse(m, request.id),
      },
      (message) => {
        const result = "result" in message ? message.result : undefined;
        if (result?.applied.includes(uri)) {
          finish("applied", result.revert);
        } else if (result?.refused?.includes(uri)) {
          finish("refused");
        }
      },
    );
    const stopClaim = onProtocolMessage(
      ClaimedEditorEditMessage.type,
      (message) => {
        if (message.params.request === request.id && message.params.uri === uri) {
          claimed = true;
        }
      },
    );
    try {
      sendProtocolMessage(request);
    } finally {
      stopClaim();
    }
    if (!claimed) {
      finish("unclaimed");
    }
  });
};

export interface EditorFixResult {
  outcome: EditorFixOutcome;
  undo: () => Promise<EditorFixOutcome>;
}

const undoFix = async (
  uri: string,
  label: string,
  revert: EditorFixRevert,
  fix?: number | string,
): Promise<EditorFixOutcome> =>
  (await requestEditorFix(uri, { label, undoFix: { uri, fix, revert } }))
    .outcome;

export const applyEditorFix = async (
  fix: EditorFix,
  label: string,
): Promise<EditorFixResult> => {
  const { uri } = fix;
  const editor = await requestEditorFix(uri, { label, fix });
  const { revert } = editor;
  return {
    outcome: editor.outcome === "applied" && !revert ? "refused" : editor.outcome,
    undo: async () =>
      revert ? undoFix(uri, label, revert, editor.id) : "refused",
  };
};
