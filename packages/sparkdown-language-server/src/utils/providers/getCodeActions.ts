import { INCLUDE_LINE_MESSAGE } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerInclude";
import {
  TOP_LEVEL_STATEMENT_MESSAGE,
  runnableTopLevelRuns,
} from "@impower/sparkdown/src/compiler/utils/declarationOnly";
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
import type { SyntaxNode } from "@lezer/common";
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
  (
    document: TextDocument,
    diagnostic: ActionableDiagnostic,
    startSceneMissingIn?: SyntaxNode,
  ) => CodeAction[]
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
  [
    TOP_LEVEL_STATEMENT_MESSAGE,
    (document, diagnostic, startSceneMissingIn) => {
      const wrap =
        startSceneMissingIn &&
        wrapInStartScene(document, startSceneMissingIn, diagnostic);
      return wrap
        ? [quickFix("Wrap in scene start", document, diagnostic, [wrap])]
        : [];
    },
  ],
]);

export const getCodeActions = (
  document: TextDocument | undefined,
  diagnostics: readonly ActionableDiagnostic[],
  startSceneMissingIn?: SyntaxNode,
): CodeAction[] => {
  if (!document) {
    return [];
  }
  return diagnostics.flatMap(
    (diagnostic) =>
      QUICK_FIXES.get(messageOf(diagnostic))?.(
        document,
        diagnostic,
        startSceneMissingIn,
      ) ?? runQuickFixes(document, diagnostic),
  );
};

export const getDiagnosticActions = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
  startSceneMissingIn?: SyntaxNode,
): { name: string; changes: { from: number; to: number; insert: string }[] }[] =>
  getCodeActions(document, [diagnostic], startSceneMissingIn).map((action) => ({
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

const wrapInStartScene = (
  document: TextDocument,
  top: SyntaxNode,
  diagnostic: ActionableDiagnostic,
): TextEdit | undefined => {
  const text = document.getText();
  const at = document.offsetAt(diagnostic.range.start);
  const run = runnableTopLevelRuns(top, (from, to) => text.slice(from, to)).find(
    ({ from, to }) => from <= at && at < to,
  );
  if (!run) {
    return undefined;
  }
  const first = document.positionAt(run.from).line;
  const last = document.positionAt(
    run.from + text.slice(run.from, run.to).trimEnd().length,
  ).line;
  const lines = text.split(/\r?\n/);
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const indent = indentOf(lines);
  const body = lines
    .slice(first, last + 1)
    .map((line) => (line.trim() ? indent + line : ""));
  return {
    range: {
      start: { line: first, character: 0 },
      end: { line: last, character: lines[last]!.length },
    },
    newText: ["scene start", ...body, "end"].join(eol),
  };
};

const indentOf = (lines: readonly string[]): string => {
  let spaces = 0;
  for (const line of lines) {
    const leading = /^[ \t]*/.exec(line)![0];
    if (!leading || !line.trim()) {
      continue;
    }
    if (leading.startsWith("\t")) {
      return "\t";
    }
    if (spaces === 0 || leading.length < spaces) {
      spaces = leading.length;
    }
  }
  return " ".repeat(spaces || 2);
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
