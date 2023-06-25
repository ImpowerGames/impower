import { Diagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { Diagnostic as LSPDiagnostic } from "vscode-languageserver-protocol";
import { getEditorDiagnosticActions } from "./getEditorDiagnosticActions";
import { getEditorDiagnosticSeverity } from "./getEditorDiagnosticSeverity";
import { positionToOffset } from "./positionToOffset";

export const getEditorDiagnostics = (
  state: EditorState,
  diagnostics: LSPDiagnostic[]
): Diagnostic[] => {
  const result: Diagnostic[] = diagnostics
    .map(
      (d): Diagnostic => ({
        from: positionToOffset(state.doc, d.range.start),
        to: positionToOffset(state.doc, d.range.end),
        severity: getEditorDiagnosticSeverity(d.severity),
        message: d.message,
        actions: getEditorDiagnosticActions(d.data),
      })
    )
    .filter(
      ({ from, to }) =>
        from !== null && to !== null && from !== undefined && to !== undefined
    )
    .sort((a, b) => {
      switch (true) {
        case a.from < b.from:
          return -1;
        case a.from > b.from:
          return 1;
      }
      return 0;
    });
  return result;
};
