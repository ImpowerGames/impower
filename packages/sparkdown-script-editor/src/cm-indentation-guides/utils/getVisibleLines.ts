import { Line } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/**
 * Gets the visible lines in the editor. Lines will not be repeated.
 *
 * @param view - The editor view to get the visible lines from.
 * @param state - The editor state. Defaults to the view's current one.
 */
export function getVisibleLines(view: EditorView, state = view.state) {
  const lines = new Set<Line>();

  for (const { from, to } of view.visibleRanges) {
    let pos = from;

    while (pos <= to) {
      const line = state.doc.lineAt(pos);

      if (!lines.has(line)) {
        lines.add(line);
      }

      pos = line.to + 1;
    }
  }

  return lines;
}
