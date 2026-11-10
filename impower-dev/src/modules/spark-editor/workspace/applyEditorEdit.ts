import {
  ApplyEditorEditMessage,
  type ApplyEditorEditParams,
  type EditorFix,
  type EditorFixChange,
} from "@impower/spark-editor-protocol/src/protocols/editor/ApplyEditorEditMessage";
import { ClaimedEditorEditMessage } from "@impower/spark-editor-protocol/src/protocols/editor/ClaimedEditorEditMessage";
import {
  onProtocolMessage,
  sendProtocolMessage,
} from "@impower/spark-editor-protocol/src/protocols/MessageProtocol";
import type { WorkspaceEdit } from "@impower/spark-editor-protocol/src/protocols/workspace/ApplyWorkspaceEditMessage";
import { stillExpected } from "@impower/sparkdown/src/compiler/utils/closeMatch";
import type { Position, TextEdit } from "vscode-languageserver-protocol";

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

type EditorFixOutcome = "applied" | "refused" | "unclaimed";

const EDITOR_FIX_TIMEOUT = 3000;

const requestEditorFix = (
  uri: string,
  params: FixRequest,
): Promise<{ outcome: EditorFixOutcome; id: number | string }> => {
  const request = ApplyEditorEditMessage.type.request({
    ...params,
    edit: {},
  });
  let claimed = false;
  return new Promise((resolve) => {
    const finish = (outcome: EditorFixOutcome) => {
      clearTimeout(timer);
      stopResponse();
      resolve({ outcome, id: request.id });
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
          finish("applied");
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

const lineStarts = (text: string) => {
  const starts = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
};

const offsetAt = (starts: number[], text: string, position: Position) => {
  const start = starts[position.line];
  if (start === undefined) {
    return -1;
  }
  const next = starts[position.line + 1];
  const end =
    next === undefined
      ? text.length
      : next - (text[next - 2] === "\r" ? 2 : 1);
  return Math.min(start + position.character, end);
};

const positionAt = (starts: number[], offset: number): Position => {
  let line = starts.length - 1;
  while (line > 0 && starts[line]! > offset) {
    line--;
  }
  return { line, character: offset - starts[line]! };
};

const inBounds = (text: string, changes: readonly EditorFixChange[]) =>
  changes.every((c) => 0 <= c.from && c.from <= c.to && c.to <= text.length);

const sortedChanges = (changes: readonly EditorFixChange[]) =>
  [...changes].sort((a, b) => a.from - b.from);

const textEditsOf = (
  text: string,
  changes: readonly EditorFixChange[],
): TextEdit[] => {
  const starts = lineStarts(text);
  return changes.map((c) => ({
    range: { start: positionAt(starts, c.from), end: positionAt(starts, c.to) },
    newText: c.insert,
  }));
};

const inverseOf = (text: string, changes: readonly EditorFixChange[]) => {
  let delta = 0;
  return sortedChanges(changes).map((c) => {
    const from = c.from + delta;
    delta += c.insert.length - (c.to - c.from);
    return { from, to: from + c.insert.length, insert: text.slice(c.from, c.to) };
  });
};

const applyClosedChanges = async (
  files: EditorEditFiles,
  uri: string,
  text: string,
  changes: readonly EditorFixChange[],
  label: string,
) => {
  const outcome = await applyEditorEdit(
    files,
    { changes: { [uri]: textEditsOf(text, changes) } },
    label,
  );
  return outcome.applied;
};

export interface EditorFixResult {
  applied: boolean;
  undo: () => Promise<boolean>;
}

const REFUSED: EditorFixResult = {
  applied: false,
  undo: async () => false,
};

export const applyEditorFix = async (
  files: EditorEditFiles,
  fix: EditorFix,
  label: string,
): Promise<EditorFixResult> => {
  const { uri } = fix;
  const editor = await requestEditorFix(uri, { label, fix });
  if (editor.outcome === "applied") {
    return {
      applied: true,
      undo: async () =>
        (
          await requestEditorFix(uri, {
            label,
            undoFix: { uri, fix: editor.id },
          })
        ).outcome === "applied",
    };
  }
  if (editor.outcome === "refused") {
    return REFUSED;
  }
  const text = await files.getFileText(uri);
  const starts = lineStarts(text);
  const from = offsetAt(starts, text, fix.range.start);
  const to = offsetAt(starts, text, fix.range.end);
  if (
    from < 0 ||
    to < from ||
    !inBounds(text, fix.changes) ||
    (fix.expect !== undefined &&
      !stillExpected(text, from, to, fix.expect, fix.kind))
  ) {
    return REFUSED;
  }
  if (!(await applyClosedChanges(files, uri, text, fix.changes, label))) {
    return REFUSED;
  }
  const inverse = inverseOf(text, fix.changes);
  const inserted = sortedChanges(fix.changes).map((c) => c.insert);
  return {
    applied: true,
    undo: async () => {
      const now = await files.getFileText(uri);
      if (
        !inBounds(now, inverse) ||
        inverse.some((c, i) => now.slice(c.from, c.to) !== inserted[i])
      ) {
        return false;
      }
      return applyClosedChanges(files, uri, now, inverse, label);
    },
  };
};
