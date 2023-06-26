import { EditorState } from "@codemirror/state";

/**
 * Gets the line at the position of the primary cursor.
 *
 * @param state - The editor state from which to extract the line.
 */
export function getCurrentLine(state: EditorState) {
  const currentPos = state.selection.main.head;
  return state.doc.lineAt(currentPos);
}
