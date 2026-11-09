import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type EditorToolCommands = Partial<
  Record<
    "find" | "findNext" | "findPrevious" | "rename" | "references",
    (view: EditorView) => void
  >
>;

export const editorToolCommands = Facet.define<
  EditorToolCommands,
  EditorToolCommands
>({
  combine: (values) => values[0] ?? {},
});

export const editorTool =
  (tool: keyof EditorToolCommands) =>
  (view: EditorView) => {
    const run = view.state.facet(editorToolCommands)[tool];
    if (!run) {
      return false;
    }
    run(view);
    return true;
  };

export const openFind = editorTool("find");

export const findNextMatch = editorTool("findNext");

export const findPreviousMatch = editorTool("findPrevious");
