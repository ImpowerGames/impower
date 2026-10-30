import { INCLUDE_LINE_MESSAGE } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerInclude";
import {
  STORE_INSIDE_FLOW_MESSAGE,
  assignmentFixOf,
} from "@impower/sparkdown/src/compiler/utils/declarationPlacement";
import {
  closeQuoteMessage,
  quotePathMessage,
  runFixesOf,
  type RunFix,
} from "@impower/sparkdown/src/compiler/utils/runOperand";
import {
  CodeAction,
  CodeActionKind,
  type Diagnostic,
  type MarkupContent,
  type TextEdit,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

export type ActionableDiagnostic = Omit<Diagnostic, "message"> & {
  message: string | MarkupContent;
};

const QUICK_FIXES = new Map<
  string,
  (document: TextDocument, diagnostic: ActionableDiagnostic) => CodeAction[]
>([
  [
    INCLUDE_LINE_MESSAGE,
    (document, diagnostic) => [
      quickFix("Delete this line", document, diagnostic, [
        deleteLine(document, diagnostic.range.start.line),
      ]),
    ],
  ],
  [
    STORE_INSIDE_FLOW_MESSAGE,
    (document, diagnostic) => {
      const assignment = assignmentFixOf(diagnostic.data);
      return assignment === undefined
        ? []
        : [
            quickFix("Change to an assignment", document, diagnostic, [
              { range: diagnostic.range, newText: assignment },
            ]),
          ];
    },
  ],
]);

export const getCodeActions = (
  document: TextDocument | undefined,
  diagnostics: readonly ActionableDiagnostic[],
): CodeAction[] => {
  if (!document) {
    return [];
  }
  return diagnostics.flatMap(
    (diagnostic) =>
      QUICK_FIXES.get(messageOf(diagnostic))?.(document, diagnostic) ??
      runQuickFixes(document, diagnostic),
  );
};

export const getDiagnosticActions = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
): { name: string; changes: { from: number; to: number; insert: string }[] }[] =>
  getCodeActions(document, [diagnostic]).map((action) => ({
    name: action.title,
    changes: (action.edit?.changes?.[document.uri] ?? []).map((edit) => ({
      from: document.offsetAt(edit.range.start),
      to: document.offsetAt(edit.range.end),
      insert: edit.newText,
    })),
  }));

const messageOf = (diagnostic: ActionableDiagnostic): string =>
  typeof diagnostic.message === "string"
    ? diagnostic.message
    : diagnostic.message.value;

const quickFix = (
  title: string,
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
  edits: TextEdit[],
  isPreferred = true,
): CodeAction => ({
  title,
  kind: CodeActionKind.QuickFix,
  diagnostics: [diagnostic as Diagnostic],
  isPreferred,
  edit: { changes: { [document.uri]: edits } },
});

const runQuickFixes = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
): CodeAction[] => {
  const message = messageOf(diagnostic);
  const operand = document.getText(diagnostic.range);
  const fixes = (choices: RunFix[]) =>
    choices.map(({ title, newText }) =>
      quickFix(
        title,
        document,
        diagnostic,
        [{ range: diagnostic.range, newText }],
        choices.length === 1,
      ),
    );
  if (message === quotePathMessage(operand)) {
    return fixes([{ title: "Quote the path", newText: `"${operand}"` }]);
  }
  if (operand && message === closeQuoteMessage(operand)) {
    return fixes([{ title: "Close the quote", newText: operand + operand[0] }]);
  }
  return fixes(runFixesOf(diagnostic.data));
};

const deleteLine = (document: TextDocument, line: number): TextEdit => {
  const start = document.offsetAt({ line, character: 0 });
  const next = document.offsetAt({ line: line + 1, character: 0 });
  const last = line >= document.lineCount - 1;
  const from =
    last && line > 0
      ? document.offsetAt({ line: line - 1, character: Number.MAX_SAFE_INTEGER })
      : start;
  return {
    range: { start: document.positionAt(from), end: document.positionAt(next) },
    newText: "",
  };
};
