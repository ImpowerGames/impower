import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import workspace from "./WorkspaceStore";

const activeEditorOf = (filename: string) => {
  const panel = filename === "main.sd" ? "main" : "scripts";
  const editor = workspace.state.value.panes?.logic?.panels?.[panel]
    ?.activeEditor;
  return editor?.filename === filename ? editor : undefined;
};

export function useCaretPosition(filename: string) {
  return useComputed(() => {
    const head = activeEditorOf(filename)?.selectedRange?.end;
    return {
      line: (head?.line ?? 0) + 1,
      column: (head?.character ?? 0) + 1,
    };
  }).value;
}

export const storyScriptOf = (
  state: WorkspaceCache = workspace.state.value,
): string | undefined => {
  if (state.pane !== "logic" || state.screen?.settingsOpen) {
    return undefined;
  }
  const logic = state.panes?.logic;
  const scripts = logic?.panels?.scripts?.activeEditor;
  if (logic?.view === "logic-editor" || logic?.panel === "scripts") {
    return scripts?.open && scripts.filename ? scripts.filename : undefined;
  }
  return "main.sd";
};

export function useEditorHistory(filename: string | undefined) {
  return useComputed(() => {
    const entry = filename ? workspace.editorHistory.value[filename] : undefined;
    return { canUndo: !!entry?.canUndo, canRedo: !!entry?.canRedo };
  }).value;
}

export function useEditorScrolled(filename: string) {
  return useComputed(() => {
    const range = activeEditorOf(filename)?.visibleRange;
    return typeof range === "object" && (range?.start?.line ?? 0) > 0;
  }).value;
}
