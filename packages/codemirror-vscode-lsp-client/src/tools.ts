import { Facet } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";

export type EditorToolCommands = Partial<
  Record<"find" | "rename" | "references", (view: EditorView) => void>
>;

export const editorToolCommands = Facet.define<
  EditorToolCommands,
  EditorToolCommands
>({
  combine: (values) => values[0] ?? {},
});

export const editorTool =
  (tool: keyof EditorToolCommands, fallback: (view: EditorView) => unknown) =>
  (view: EditorView) => {
    (view.state.facet(editorToolCommands)[tool] ?? fallback)(view);
    return true;
  };
