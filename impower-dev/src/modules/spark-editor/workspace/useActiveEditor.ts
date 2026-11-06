import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { computed } from "@preact/signals";
import { useMemo } from "preact/hooks";
import workspace from "./WorkspaceStore";

const activeEditorOf = (filename: string) => {
  const panel = filename === "main.sd" ? "main" : "scripts";
  const editor =
    workspace.state.value.panes?.logic?.panels?.[panel]?.activeEditor;
  return editor?.filename === filename ? editor : undefined;
};

const useScriptValue = <F extends string | undefined, T>(
  filename: F,
  read: (filename: F) => T,
): T => useMemo(() => computed(() => read(filename)), [filename]).value;

const caretPositionOf = (filename: string) => {
  const head = activeEditorOf(filename)?.selectedRange?.end;
  return {
    line: (head?.line ?? 0) + 1,
    column: (head?.character ?? 0) + 1,
  };
};

export function useCaretPosition(filename: string) {
  return useScriptValue(filename, caretPositionOf);
}

export const storyScriptOf = (
  state: WorkspaceCache = workspace.state.value,
): string | undefined => {
  if (state.pane !== "logic" || state.screen?.settingsOpen) {
    return undefined;
  }
  const logic = state.panes?.logic;
  const scripts = logic?.panels?.scripts?.activeEditor;
  if (logic?.view === "logic-editor") {
    return scripts?.filename || undefined;
  }
  if (logic?.panel === "scripts") {
    return scripts?.open && scripts.filename ? scripts.filename : undefined;
  }
  return "main.sd";
};

const editorHistoryOf = (filename: string | undefined) => {
  const entry = filename ? workspace.editorHistory.value[filename] : undefined;
  return { canUndo: !!entry?.canUndo, canRedo: !!entry?.canRedo };
};

export function useEditorHistory(filename: string | undefined) {
  return useScriptValue(filename, editorHistoryOf);
}

const editorScrolledOf = (filename: string) => {
  const range = activeEditorOf(filename)?.visibleRange;
  return typeof range === "object" && (range?.start?.line ?? 0) > 0;
};

export function useEditorScrolled(filename: string) {
  return useScriptValue(filename, editorScrolledOf);
}
