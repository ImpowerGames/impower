import {
  DebugCallStackRowView,
  debugCallStackRowHeight,
  debugCallStackRowKey,
  debugCallStackRows,
  type DebugCallStackHandlers,
  type DebugCallStackRow,
} from "@impower/spark-web-player/src/components/DebugCallStack/DebugCallStack";
import {
  DebugVariablesRowView,
  debugVariablesRowHeight,
  debugVariablesRowKey,
  debugVariablesRows,
  type DebugVariablesHandlers,
  type DebugVariablesRow,
} from "@impower/spark-web-player/src/components/DebugVariables/DebugVariables";
import {
  DebugWatchRowView,
  debugWatchRowHeight,
  debugWatchRowKey,
  debugWatchRows,
  type DebugWatchHandlers,
  type DebugWatchRow,
} from "@impower/spark-web-player/src/components/DebugWatch/DebugWatch";
import { useComputed } from "@preact/signals";
import { useMemo } from "preact/hooks";
import type WorkspaceDebugInspection from "../../workspace/WorkspaceDebugInspection";
import {
  frameEntries,
  watchEntries,
} from "../../workspace/WorkspaceDebugInspection";
import workspace from "../../workspace/WorkspaceStore";
import type { CardName } from "../../workspace/problems/problemEntries";
import problems from "../../workspace/problems/ProblemsStore";

export type DebugRow = DebugVariablesRow | DebugWatchRow | DebugCallStackRow;

const withInspection = (
  act: (inspection: WorkspaceDebugInspection) => unknown,
) =>
  void import("../../workspace/Workspace").then(({ Workspace }) =>
    act(Workspace.window.debug.inspection),
  );

const variablesHandlers: DebugVariablesHandlers = {
  onOpenChange: (open) => problems.setCardOpen("variables", open),
  onToggle: (node) => withInspection((inspection) => inspection.toggle(node.key)),
  onEdit: (node) => withInspection((inspection) => inspection.edit(node?.key ?? null)),
  onSetValue: (node, value) =>
    withInspection((inspection) => inspection.setValue(node.key, value)),
  onBreakOnChange: (node, on) =>
    withInspection((inspection) => inspection.breakOnChange(node.key, on)),
};

const watchHandlers: DebugWatchHandlers = {
  onOpenChange: (open) => problems.setCardOpen("watch", open),
  onAdd: (expression) => withInspection((inspection) => inspection.addWatch(expression)),
  onEdit: (entry) =>
    withInspection((inspection) => inspection.editWatch(entry ? Number(entry.key) : null)),
  onChange: (entry, expression) =>
    withInspection((inspection) => inspection.changeWatch(Number(entry.key), expression)),
  onRemove: (entry) =>
    withInspection((inspection) => inspection.removeWatch(Number(entry.key))),
};

const callStackHandlers: DebugCallStackHandlers = {
  onOpenChange: (open) => problems.setCardOpen("callStack", open),
  onSelect: (entry) =>
    withInspection(async (inspection) => {
      const frame = inspection.state.frames.find((f) => f.id === entry.id);
      if (frame?.inProject) {
        await problems.jump({
          uri: frame.uri,
          line: frame.line + 1,
          character: frame.character,
        });
      }
      await inspection.selectFrame(entry.id);
    }),
};

export function useDebugRows(open: Readonly<Record<CardName, boolean>>): DebugRow[] {
  const state = useComputed(() => workspace.debugInspection.value).value;
  const expressions = useComputed(() => workspace.watchExpressions.value).value;
  return useMemo(
    () => [
      ...debugVariablesRows({
        status: state.status,
        open: open.variables,
        scopes: state.variables,
        editing: state.editing,
      }),
      ...debugWatchRows({
        status: state.status,
        open: open.watch,
        entries: watchEntries(state, expressions),
        editing: state.watchEditing == null ? null : String(state.watchEditing),
      }),
      ...debugCallStackRows({
        status: state.status,
        open: open.callStack,
        frames: frameEntries(state),
      }),
    ],
    [state, expressions, open.variables, open.watch, open.callStack],
  );
}

export const debugRowHeight = (row: DebugRow) =>
  row.card === "variables"
    ? debugVariablesRowHeight(row)
    : row.card === "watch"
      ? debugWatchRowHeight(row)
      : debugCallStackRowHeight(row);

export const debugRowKey = (row: DebugRow) =>
  row.card === "variables"
    ? debugVariablesRowKey(row)
    : row.card === "watch"
      ? debugWatchRowKey(row)
      : debugCallStackRowKey(row);

export function DebugRowView({ row }: { row: DebugRow }) {
  return row.card === "variables" ? (
    <DebugVariablesRowView row={row} handlers={variablesHandlers} />
  ) : row.card === "watch" ? (
    <DebugWatchRowView row={row} handlers={watchHandlers} />
  ) : (
    <DebugCallStackRowView row={row} handlers={callStackHandlers} />
  );
}
