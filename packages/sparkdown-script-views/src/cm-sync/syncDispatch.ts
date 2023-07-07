import { Annotation, ChangeSet, Text, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import syncAnnotation from "./syncAnnotation";

export const syncDispatch = (
  tr: Transaction,
  view: EditorView,
  onEdit?: (change: {
    before: Text;
    after: Text;
    changes: ChangeSet;
    annotations: Annotation<any>[];
  }) => void
) => {
  const before = view.state.doc;
  view.update([tr]);
  const after = view.state.doc;
  if (!tr.changes.empty && !tr.annotation(syncAnnotation)) {
    const annotations: Annotation<any>[] = [syncAnnotation.of(true)];
    const userEvent = tr.annotation(Transaction.userEvent);
    if (userEvent) {
      annotations.push(Transaction.userEvent.of(userEvent));
    }
    onEdit?.({ changes: tr.changes, annotations, before, after });
  }
};
