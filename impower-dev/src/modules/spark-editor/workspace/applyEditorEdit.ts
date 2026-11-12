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
import type {
  ApplyWorkspaceEditResult,
  WorkspaceEdit,
  WorkspaceEditMetadata,
} from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";

export interface EditorEditFiles {
  getFileText: (uri: string) => Promise<string>;
  applyWorkspaceEdit: (
    edit: WorkspaceEdit,
    label?: string,
    metadata?: WorkspaceEditMetadata,
    expectedTexts?: Record<string, string>,
    confirm?: () => Promise<string | undefined>,
  ) => Promise<ApplyWorkspaceEditResult>;
}

const EDITOR_TIMEOUT = 3000;

type DocumentChange = NonNullable<WorkspaceEdit["documentChanges"]>[number];

const editedUri = (change: DocumentChange) =>
  "textDocument" in change ? change.textDocument.uri : undefined;

export const documentChangesOf = (edit: WorkspaceEdit): DocumentChange[] =>
  edit.documentChanges ??
  Object.entries(edit.changes ?? {}).map(([uri, edits]) => ({
    textDocument: { uri, version: null },
    edits,
  }));

export type EditorEditKind = "replace" | "rename-symbol";

const changedUris = (change: DocumentChange) =>
  "textDocument" in change
    ? [change.textDocument.uri]
    : change.kind === "rename"
      ? [change.oldUri]
      : [change.uri];

const isHeld = (held: Map<string, string>, change: DocumentChange) => {
  const uri = editedUri(change);
  return uri !== undefined && held.has(uri);
};

const changedBefore = (uri: string) =>
  `${uri.split("/").pop()} changed before the edit could be applied`;

const refused = (failureReason: string): ApplyWorkspaceEditResult => ({
  applied: false,
  failureReason,
  rollback: { complete: true, failed: [], kept: [] },
});

export const failureOf = (outcome: ApplyWorkspaceEditResult, nothing: string) =>
  !outcome.failureReason
    ? nothing
    : outcome.rollback?.complete
      ? `${outcome.failureReason.replace(/[.]$/, "")}. ${nothing}`
      : outcome.failureReason;

const normalized = (text: string) => text.replace(/\r\n?/g, "\n");

const sameTexts = (a: readonly string[] = [], b: readonly string[] = []) =>
  a.length === b.length && [...a].sort().every((text, i) => text === [...b].sort()[i]);

const claimTexts = (label: string, documentChanges: DocumentChange[]) => {
  const request = ApplyEditorEditMessage.type.request({
    label,
    edit: { documentChanges },
    claim: true,
  });
  const claims = new Map<string, string[]>();
  const stop = onProtocolMessage(ClaimedEditorEditMessage.type, (message) => {
    const { request: id, uri, text } = message.params;
    if (id === request.id) {
      claims.set(uri, [...(claims.get(uri) ?? []), text]);
    }
  });
  try {
    sendProtocolMessage(request);
  } finally {
    stop();
  }
  return claims;
};

const applyInEditors = (
  request: ApplyEditorEditMessage.Request,
  uris: string[],
): Promise<Set<string>> =>
  new Promise((resolve) => {
    const applied = new Set<string>();
    const answered = new Set<string>();
    const finish = () => {
      clearTimeout(timer);
      stop();
      resolve(applied);
    };
    const timer = setTimeout(finish, EDITOR_TIMEOUT);
    const stop = onProtocolMessage(
      {
        is: (m: unknown): m is ApplyEditorEditMessage.Response =>
          ApplyEditorEditMessage.type.isResponse(m, request.id),
      },
      (message) => {
        const result = "result" in message ? message.result : undefined;
        result?.applied.forEach((uri) => {
          applied.add(uri);
          answered.add(uri);
        });
        result?.refused?.forEach((uri) => answered.add(uri));
        if (uris.every((uri) => answered.has(uri))) {
          finish();
        }
      },
    );
    sendProtocolMessage(request);
    if (!uris.length) {
      finish();
    }
  });

const commitInEditors = async (
  label: string,
  documentChanges: DocumentChange[],
  claims: Map<string, string[]>,
  closedTexts: Record<string, string>,
): Promise<string | undefined> => {
  const held = new Map([...claims].map(([uri, [text]]) => [uri, text!]));
  const now = claimTexts(
    label,
    documentChanges.filter((c) => editedUri(c)),
  );
  const changed = [...new Set([...claims.keys(), ...now.keys()])].find(
    (uri) =>
      claims.has(uri)
        ? !sameTexts(claims.get(uri), now.get(uri))
        : now
            .get(uri)!
            .some(
              (text) => normalized(text) !== normalized(closedTexts[uri] ?? ""),
            ),
  );
  if (changed) {
    return changedBefore(changed);
  }
  const applied = await applyInEditors(
    ApplyEditorEditMessage.type.request({
      label,
      edit: { documentChanges: documentChanges.filter((c) => editedUri(c)) },
      closedTexts,
      expectedTexts: Object.fromEntries(held),
    }),
    [...held.keys()],
  );
  const refused = [...held.keys()].find((uri) => !applied.has(uri));
  return refused ? changedBefore(refused) : undefined;
};

export const applyEditorEdit = async (
  files: EditorEditFiles,
  edit: WorkspaceEdit,
  label: string,
  kind?: EditorEditKind,
): Promise<ApplyWorkspaceEditResult> => {
  const documentChanges = documentChangesOf(edit);
  const claims = claimTexts(label, documentChanges);
  const split = [...claims].find(([, texts]) => new Set(texts).size > 1);
  if (split) {
    return refused(changedBefore(split[0]));
  }
  const held = new Map([...claims].map(([uri, [text]]) => [uri, text!]));
  const closedUris = [
    ...new Set(
      documentChanges.flatMap((c) => {
        const uri = editedUri(c);
        return uri && !held.has(uri) ? [uri] : [];
      }),
    ),
  ];
  const closedTexts: Record<string, string> = {};
  await Promise.all(
    closedUris.map(async (uri) => {
      closedTexts[uri] = await files.getFileText(uri);
    }),
  );
  const commit = () =>
    commitInEditors(label, documentChanges, claims, closedTexts);
  const rest = documentChanges.filter((c) => !isHeld(held, c));
  if (!rest.length) {
    const refusal = await commit();
    return refusal === undefined ? { applied: true } : refused(refusal);
  }
  return files.applyWorkspaceEdit(
    { documentChanges: rest },
    label,
    {
      isRefactoring: true,
      ...(kind ? { action: { kind, targets: rest.flatMap(changedUris) } } : {}),
    },
    closedTexts,
    commit,
  );
};

type FixRequest = Pick<ApplyEditorEditParams, "label" | "fix" | "undoFix">;

export type EditorFixOutcome = "applied" | "refused" | "unclaimed";

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
    const timer = setTimeout(() => finish("refused"), EDITOR_TIMEOUT);
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
