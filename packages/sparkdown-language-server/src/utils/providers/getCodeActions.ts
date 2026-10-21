import { INCLUDE_LINE_MESSAGE } from "@impower/sparkdown/src/compiler/lower/lowerers/lowerInclude";
import {
  endsWithLuauExtension,
  parseRunMessage,
  quotedRunPath,
} from "@impower/sparkdown/src/compiler/utils/runOperand";
import {
  CodeAction,
  CodeActionKind,
  type Diagnostic,
  type MarkupContent,
  type TextEdit,
} from "vscode-languageserver";
import type { TextDocument } from "vscode-languageserver-textdocument";

/** A diagnostic as a client sends it back, whose message can be markup. */
export type ActionableDiagnostic = Omit<Diagnostic, "message"> & {
  message: string | MarkupContent;
};

/** The quick fixes for the diagnostics that have one, each by the message the
 *  compiler reports. */
const QUICK_FIXES = new Map<
  string,
  (document: TextDocument, diagnostic: ActionableDiagnostic) => CodeAction[]
>([
  // Every script under the project's folder is part of the story (#1387).
  [
    INCLUDE_LINE_MESSAGE,
    (document, diagnostic) => [
      quickFix("Delete this line", document, diagnostic, [
        deleteLine(document, diagnostic.range.start.line),
      ]),
    ],
  ],
]);

/**
 * The code actions for `diagnostics` in `document`: the quick fixes of each
 * diagnostic whose message has one, in the order the diagnostics are given.
 */
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

/**
 * The quick fixes of `diagnostic` as the editor's own diagnostics carry
 * them in their `data` (the web editor's client, which asks for no code
 * actions): each fix's title and its edits to `document`, by offset.
 */
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

/**
 * The quick fixes of a diagnostic on a `run` statement's operand, which is
 * the diagnostic's range (#1389): an unquoted path takes its quotes, a name
 * several Luau files have takes the quoted path of one of them, and an
 * operand that differs from files only by case takes one's spelling in its
 * own form, a name or a quoted path with its extension written or left out
 * (#1334). When there is more than one fix none is preferred, since which
 * file is meant is the author's call.
 */
const runQuickFixes = (
  document: TextDocument,
  diagnostic: ActionableDiagnostic,
): CodeAction[] => {
  const run = parseRunMessage(messageOf(diagnostic));
  if (!run) {
    return [];
  }
  const operand = document.getText(diagnostic.range);
  const quote = operand[0] === '"' || operand[0] === "'" ? operand[0] : "";
  const fixes = (choices: { title: string; text: string }[]) =>
    choices.map(({ title, text }) =>
      quickFix(
        title,
        document,
        diagnostic,
        [{ range: diagnostic.range, newText: text }],
        choices.length === 1,
      ),
    );
  switch (run.kind) {
    case "quotePath":
      return quote ? [] : fixes([{ title: "Quote the path", text: `"${operand}"` }]);
    case "ambiguousName":
      return fixes(
        run.paths.map((path) => {
          const text = `"${quotedRunPath(path)}"`;
          return { title: `Use ${text}`, text };
        }),
      );
    case "missingName":
      return fixes(
        run.suggestions.map((name) => ({ title: `Change to '${name}'`, text: name })),
      );
    case "missingPath": {
      if (!quote) {
        return [];
      }
      const keepsExtension = endsWithLuauExtension(operand.slice(1, -1));
      return fixes(
        run.suggestions.map((path) => {
          const spelled = keepsExtension ? path : quotedRunPath(path);
          return { title: `Change to '${spelled}'`, text: quote + spelled + quote };
        }),
      );
    }
  }
};

/** The edit that deletes `line` with its line break; the last line, which
 *  has none, takes the break before it. */
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
