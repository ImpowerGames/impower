import { Annotation, Transaction } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import syncAnnotation from "./syncAnnotation";

export const syncDispatch = (
  transactions: readonly Transaction[],
  view: EditorView
) => {
  for (const transaction of transactions) {
    if (!transaction.changes.empty && !transaction.annotation(syncAnnotation)) {
      const annotations: Annotation<any>[] = [syncAnnotation.of(true)];
      const userEvent = transaction.annotation(Transaction.userEvent);
      if (userEvent) {
        annotations.push(Transaction.userEvent.of(userEvent));
      }
    }
  }
  view.update(transactions);
};
