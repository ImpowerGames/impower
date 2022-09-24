import { Diagnostic } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { SparkDiagnostic } from "../../../../sparkdown";

export const getDiagnostics = (
  diagnostics: SparkDiagnostic[]
): Diagnostic[] => {
  if (!diagnostics) {
    return [];
  }
  return diagnostics.map((d) => ({
    ...d,
    actions: d.actions.map((a) => ({
      ...a,
      apply: (view: EditorView, _from: number, _to: number): void => {
        if (a.focus) {
          view.dispatch({
            selection: { anchor: a.focus.from, head: a.focus.to },
            effects: EditorView.scrollIntoView(
              EditorSelection.range(a.focus.from, a.focus.to),
              { y: "center" }
            ),
          });
          view.focus();
        }
        if (a.changes?.length > 0) {
          const lastChange = a.changes[a.changes.length - 1];
          const cursor =
            lastChange.insert != null
              ? lastChange.from + lastChange.insert.length
              : lastChange.from;
          view.dispatch({
            changes: a.changes,
            selection: { anchor: cursor, head: cursor },
          });
        }
      },
    })),
  }));
};
