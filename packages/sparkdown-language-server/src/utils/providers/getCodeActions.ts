import {
  closeMatchOf,
  expectedTextOf,
  stillExpected,
  type FixKind,
} from "@impower/sparkdown/src/compiler/utils/closeMatch";
import { INCLUDE_LINE_MESSAGE } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerInclude";
import {
  ADD_ASSET_COMMAND,
  missingAssetOf,
  type MissingAsset,
} from "@impower/sparkdown/src/compiler/utils/missingAsset";
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
import { TODO_NOTE_SOURCE } from "./getTodoNotes";

export type ActionableDiagnostic = Omit<Diagnostic, "message"> & {
  message: string | MarkupContent;
};

export interface DiagnosticEditAction {
  name: string;
  done: string;
  expect?: string;
  kind?: FixKind;
  changes: { from: number; to: number; insert: string }[];
}

export interface DiagnosticCommandAction {
  name: string;
  command: { command: string; arguments?: unknown[] };
}

export type DiagnosticAction = DiagnosticEditAction | DiagnosticCommandAction;

type QuickFixData = Pick<DiagnosticEditAction, "done" | "expect" | "kind">;

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
      quickFix("Delete this line", "Line deleted.", document, diagnostic, [
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
            quickFix(
              "Change to an assignment",
              "Changed to an assignment.",
              document,
              diagnostic,
              [{ range: diagnostic.range, newText: assignment }],
            ),
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
        ? [
            quickFix(
              "Wrap in scene start",
              "Wrapped in scene start.",
              document,
              diagnostic,
              [wrap],
            ),
          ]
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
  return diagnostics.flatMap((diagnostic) => {
    const expected = expectedTextOf(diagnostic.data);
    if (
      expected !== undefined &&
      !stillExpected(
        document.getText(),
        document.offsetAt(diagnostic.range.start),
        document.offsetAt(diagnostic.range.end),
        expected,
        fixKindOf(diagnostic),
      )
    ) {
      return [];
    }
    const byMessage = QUICK_FIXES.get(messageOf(diagnostic));
    if (byMessage) {
      return byMessage(document, diagnostic, startSceneMissingIn);
    }
    if (diagnostic.source === TODO_NOTE_SOURCE) {
      return [
        quickFix("Remove the note", "Note removed.", document, diagnostic, [
          removeNote(document, diagnostic),
        ]),
      ];
    }
    const close = closeMatchOf(diagnostic.data);
    const missing = missingAssetOf(diagnostic.data);
    if (close || missing) {
      return [
        ...(close
          ? [
              quickFix(
                `Use ${close.match} instead`,
                `Changed to ${close.match}.`,
                document,
                diagnostic,
                [{ range: diagnostic.range, newText: close.match }],
              ),
            ]
          : []),
        ...(missing ? [addAssetFix(diagnostic, missing)] : []),
      ];
    }
    return runQuickFixes(document, diagnostic);
  });
};

export const getDiagnosticActions = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
  startSceneMissingIn?: SyntaxNode,
): DiagnosticAction[] =>
  getCodeActions(document, [diagnostic], startSceneMissingIn).map((action) =>
    action.command
      ? {
          name: action.title,
          command: {
            command: action.command.command,
            arguments: action.command.arguments,
          },
        }
      : {
          name: action.title,
          ...(action.data as QuickFixData),
          changes: (action.edit?.changes?.[document.uri] ?? []).map((edit) => ({
            from: document.offsetAt(edit.range.start),
            to: document.offsetAt(edit.range.end),
            insert: edit.newText,
          })),
        },
  );

const addAssetFix = (
  diagnostic: ActionableDiagnostic,
  { name, type }: MissingAsset,
): CodeAction => {
  const title = `Add ${name} to assets`;
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic as Diagnostic],
    isPreferred: false,
    command: { title, command: ADD_ASSET_COMMAND, arguments: [{ name, type }] },
  };
};

const fixKindOf = (diagnostic: ActionableDiagnostic): FixKind | undefined =>
  diagnostic.source === TODO_NOTE_SOURCE
    ? "note"
    : closeMatchOf(diagnostic.data)
      ? "name"
      : undefined;

const messageOf = (diagnostic: ActionableDiagnostic): string =>
  typeof diagnostic.message === "string"
    ? diagnostic.message
    : diagnostic.message.value;

const quickFix = (
  title: string,
  done: string,
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
  edits: TextEdit[],
  isPreferred = true,
): CodeAction => {
  const expect = expectedTextOf(diagnostic.data);
  const kind = fixKindOf(diagnostic);
  const data: QuickFixData =
    expect === undefined
      ? { done }
      : kind === undefined
        ? { done, expect }
        : { done, expect, kind };
  return {
    title,
    kind: CodeActionKind.QuickFix,
    diagnostics: [diagnostic as Diagnostic],
    isPreferred,
    edit: { changes: { [document.uri]: edits } },
    data,
  };
};

const runQuickFixes = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
): CodeAction[] => {
  const message = messageOf(diagnostic);
  const operand = document.getText(diagnostic.range);
  const fixes = (choices: RunFix[], done?: string) =>
    choices.map(({ title, newText }) =>
      quickFix(
        title,
        done ?? `Changed to ${newText}.`,
        document,
        diagnostic,
        [{ range: diagnostic.range, newText }],
        choices.length === 1,
      ),
    );
  if (message === quotePathMessage(operand)) {
    return fixes(
      [{ title: "Quote the path", newText: `"${operand}"` }],
      "Path quoted.",
    );
  }
  if (operand && message === closeQuoteMessage(operand)) {
    return fixes(
      [{ title: "Close the quote", newText: operand + operand[0] }],
      "Quote closed.",
    );
  }
  return fixes(runFixesOf(diagnostic.data));
};

const removeNote = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
): TextEdit => {
  const { start, end } = diagnostic.range;
  const before = document.getText({
    start: { line: start.line, character: 0 },
    end: start,
  });
  const lineEnd = document.positionAt(
    document.offsetAt({ line: end.line, character: Number.MAX_SAFE_INTEGER }),
  );
  if (!before.trim()) {
    return deleteLine(document, start.line);
  }
  return {
    range: {
      start: { line: start.line, character: before.trimEnd().length },
      end: lineEnd,
    },
    newText: "",
  };
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
  const literal = (line: number) =>
    startsInsideString(top, document.offsetAt({ line, character: 0 }));
  const indent = indentOf(lines, literal);
  const body = lines
    .slice(first, last + 1)
    .map((line, i) =>
      literal(first + i) ? line : line.trim() ? indent + line : "",
    );
  return {
    range: {
      start: { line: first, character: 0 },
      end: { line: last, character: lines[last]!.length },
    },
    newText: ["scene start", ...body, "end"].join(eol),
  };
};

const startsInsideString = (top: SyntaxNode, at: number): boolean => {
  for (
    let node: SyntaxNode | null = top.resolveInner(at, 1);
    node;
    node = node.parent
  ) {
    if (node.from < at && node.name.endsWith("String")) {
      return true;
    }
  }
  return false;
};

const indentOf = (
  lines: readonly string[],
  literal: (line: number) => boolean,
): string => {
  let spaces = 0;
  for (const [i, line] of lines.entries()) {
    const leading = /^[ \t]*/.exec(line)![0];
    if (!leading || !line.trim() || literal(i)) {
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
