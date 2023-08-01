import { Annotation, Text, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import syncAnnotation from "./syncAnnotation";

export const syncDispatch = (
  transaction: Transaction,
  view: EditorView,
  onEdit?: (change: {
    transaction: Transaction;
    annotations: Annotation<any>[];
    before: Text;
    after: Text;
  }) => void
) => {
  const before = view.state.doc;
  view.update([transaction]);
  const after = view.state.doc;
  if (!transaction.changes.empty && !transaction.annotation(syncAnnotation)) {
    const annotations: Annotation<any>[] = [syncAnnotation.of(true)];
    const userEvent = transaction.annotation(Transaction.userEvent);
    if (userEvent) {
      annotations.push(Transaction.userEvent.of(userEvent));
    }
    onEdit?.({ transaction, annotations, before, after });
  }
};
