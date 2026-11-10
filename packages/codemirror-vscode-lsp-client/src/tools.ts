import { openLintPanel } from "@codemirror/lint";
import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type EditorToolCommands = Partial<
  Record<
    "find" | "findNext" | "findPrevious" | "rename" | "references" | "problems",
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
  (tool: keyof EditorToolCommands, fallback?: (view: EditorView) => unknown) =>
  (view: EditorView) => {
    const run = view.state.facet(editorToolCommands)[tool] ?? fallback;
    if (!run) {
      return false;
    }
    run(view);
    return true;
  };

export const openFind = editorTool("find");

export const openProblems = editorTool("problems", openLintPanel);

export const findNextMatch = editorTool("findNext");

export const findPreviousMatch = editorTool("findPrevious");

export const findReferences = editorTool("references");
