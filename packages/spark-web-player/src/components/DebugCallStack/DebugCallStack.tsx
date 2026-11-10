import {
  ListRow,
  PANEL_CARD_HEIGHT,
  PanelCardHead,
  PanelCardNote,
  PanelCardRow,
  VIRTUAL_LIST_ROW_HEIGHT,
} from "@impower/impower-ui/components";
import {
  DebugNameValue,
  type DebugStatus,
} from "../DebugVariables/DebugVariables";

export interface DebugFrameEntry {
  id: number;
  name: string;
  location: string;
  inProject: boolean;
  selected: boolean;
}

export interface DebugCallStackState {
  status: DebugStatus;
  open: boolean;
  frames: readonly DebugFrameEntry[];
}

export interface DebugCallStackHandlers {
  onOpenChange: (open: boolean) => void;
  onSelect: (frame: DebugFrameEntry) => void;
}

export const DEBUG_CALL_STACK_TEXT = {
  title: "Call stack",
  none: "Play the story to inspect it.",
  running: "Pause the story to inspect it.",
  outside: "This frame is outside the project's scripts.",
  show: (frame: DebugFrameEntry) => `Show ${frame.name} at ${frame.location}`,
} as const;

export type DebugCallStackRow =
  | { card: "callStack"; kind: "head"; open: boolean }
  | { card: "callStack"; kind: "note"; text: string }
  | { card: "callStack"; kind: "frame"; frame: DebugFrameEntry }
  | { card: "callStack"; kind: "end" };

export function debugCallStackRows({
  status,
  open,
  frames,
}: DebugCallStackState): DebugCallStackRow[] {
  const rows: DebugCallStackRow[] = [{ card: "callStack", kind: "head", open }];
  if (!open) {
    return rows;
  }
  if (status !== "paused") {
    rows.push({
      card: "callStack",
      kind: "note",
      text: DEBUG_CALL_STACK_TEXT[status],
    });
  } else {
    for (const frame of frames) {
      rows.push({ card: "callStack", kind: "frame", frame });
    }
  }
  rows.push({ card: "callStack", kind: "end" });
  return rows;
}

export const debugCallStackRowHeight = (row: DebugCallStackRow) =>
  row.kind === "head"
    ? PANEL_CARD_HEIGHT.head
    : row.kind === "end"
      ? PANEL_CARD_HEIGHT.end
      : row.kind === "note"
        ? PANEL_CARD_HEIGHT.note
        : VIRTUAL_LIST_ROW_HEIGHT.compact;

export const debugCallStackRowKey = (row: DebugCallStackRow) =>
  row.kind === "frame"
    ? `callStack:frame:${row.frame.id}`
    : `callStack:${row.kind}`;

export function DebugCallStackRowView({
  row,
  handlers,
}: {
  row: DebugCallStackRow;
  handlers: DebugCallStackHandlers;
}) {
  switch (row.kind) {
    case "head":
      return (
        <PanelCardHead
          title={DEBUG_CALL_STACK_TEXT.title}
          open={row.open}
          onOpenChange={handlers.onOpenChange}
        />
      );
    case "note":
      return <PanelCardNote>{row.text}</PanelCardNote>;
    case "frame": {
      const { frame } = row;
      return (
        <PanelCardRow part="body">
          <ListRow
            size="compact"
            current={frame.selected ? "location" : false}
            label={
              <DebugNameValue
                name={frame.name}
                value={
                  <span class={frame.inProject ? "text-accent" : undefined}>
                    {frame.location}
                  </span>
                }
              />
            }
            aria-label={
              frame.inProject
                ? DEBUG_CALL_STACK_TEXT.show(frame)
                : `${frame.name}, ${frame.location}. ${DEBUG_CALL_STACK_TEXT.outside}`
            }
            title={
              frame.inProject
                ? DEBUG_CALL_STACK_TEXT.show(frame)
                : DEBUG_CALL_STACK_TEXT.outside
            }
            onClick={() => handlers.onSelect(frame)}
          />
        </PanelCardRow>
      );
    }
    case "end":
      return <PanelCardRow part="end" />;
  }
}
