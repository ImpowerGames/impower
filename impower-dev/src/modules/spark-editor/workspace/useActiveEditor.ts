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

export function useScriptReadonly() {
  return useComputed(() => {
    const status = workspace.state.value.sync?.status;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  }).value;
}

export function useEditorScrolled(filename: string) {
  return useComputed(() => {
    const range = activeEditorOf(filename)?.visibleRange;
    return typeof range === "object" && (range?.start?.line ?? 0) > 0;
  }).value;
}
