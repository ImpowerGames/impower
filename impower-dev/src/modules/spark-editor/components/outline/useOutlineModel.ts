import type { WorkspaceCache } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import { useMemo } from "preact/hooks";
import type { Position } from "vscode-languageserver-protocol";
import workspace from "../../workspace/WorkspaceStore";
import { outlineRows } from "./outlineRows";

const caretIn = (
  state: WorkspaceCache,
  uri: string | undefined,
): Position | undefined => {
  const logic = state.panes?.logic;
  if (!logic || !uri) {
    return undefined;
  }
  const current = logic.panels[logic.panel]?.activeEditor;
  const editor = current?.open
    ? current
    : Object.values(logic.panels).find((p) => p?.activeEditor?.open)
        ?.activeEditor;
  if (!editor?.filename || !uri.endsWith(`/${editor.filename}`)) {
    return undefined;
  }
  return editor.selectedRange?.start;
};

export default function useOutlineModel({
  collapsible = true,
}: { collapsible?: boolean } = {}) {
  const snapshot = workspace.outline.value;
  const caret = useComputed(() =>
    caretIn(workspace.state.value, workspace.outline.value?.uri),
  ).value;
  const collapsed = useComputed(
    () =>
      workspace.state.value.outline?.collapsed?.[
        workspace.outline.value?.uri ?? ""
      ],
  ).value;
  const model = useMemo(
    () =>
      outlineRows({
        symbols: snapshot?.symbols ?? [],
        diagnostics: snapshot?.diagnostics ?? [],
        caret,
        collapsed: collapsible ? collapsed : undefined,
        firstContentLine: snapshot?.firstContentLine,
      }),
    [snapshot, caret?.line, caret?.character, collapsed, collapsible],
  );
  return { uri: snapshot?.uri, model };
}
