import { Action } from "@codemirror/lint";
import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export const getEditorDiagnosticActions = (
  data: {
    name: string;
    focus?: { from: number; to: number };
    changes?: { from: number; to?: number; insert?: string }[];
  }[]
): Action[] => {
  const actions: Action[] = [];
  if (!data) {
    return actions;
  }
  data.forEach((a) => {
    actions.push({
      name: a.name,
      apply: (view: EditorView) => {
        const doc = view.state.doc.toString();
        if (a.focus) {
          view.dispatch({
            selection: {
              anchor: Math.min(doc.length, Math.max(0, a.focus.from)),
              head: Math.min(doc.length, a.focus.to),
            },
            effects: EditorView.scrollIntoView(
              EditorSelection.range(
                Math.min(doc.length, Math.max(0, a.focus.from)),
                Math.min(doc.length, a.focus.to)
              ),
              { y: "center" }
            ),
          });
          view.focus();
        }
        if (a.changes && a.changes.length > 0) {
          const lastChange = a.changes[a.changes.length - 1]!;
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
    });
  });
  return actions;
};
