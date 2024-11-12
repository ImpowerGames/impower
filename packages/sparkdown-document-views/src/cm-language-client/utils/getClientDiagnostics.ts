import { Diagnostic as ClientDiagnostic } from "@codemirror/lint";
import { EditorState } from "@codemirror/state";
import { Diagnostic as ServerDiagnostic } from "../../../../spark-editor-protocol/src/types";
import { getClientDiagnosticActions } from "./getClientDiagnosticActions";
import { getClientDiagnosticSeverity } from "./getClientDiagnosticSeverity";
import { positionToOffset } from "./positionToOffset";

export const getClientDiagnostics = (
  state: EditorState,
  diagnostics: ServerDiagnostic[]
): ClientDiagnostic[] => {
  const result: ClientDiagnostic[] = diagnostics
    .map(
      (d): ClientDiagnostic => ({
        from: positionToOffset(state.doc, d.range.start),
        to: positionToOffset(state.doc, d.range.end),
        severity: getClientDiagnosticSeverity(d.severity),
        message: d.message,
        actions: getClientDiagnosticActions(d.data),
      })
    )
    .filter(({ from, to }) => from != null && to != null && from <= to)
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
