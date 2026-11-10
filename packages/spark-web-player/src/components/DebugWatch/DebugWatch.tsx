import {
  Button,
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
  ListRow,
  MoreVerticalIcon,
  PANEL_CARD_HEIGHT,
  PanelCardHead,
  PanelCardNote,
  PanelCardRow,
  PencilIcon,
  TextField,
  TrashIcon,
  VIRTUAL_LIST_ROW_HEIGHT,
  WarningIcon,
} from "@impower/impower-ui/components";
import {
  DebugNameValue,
  DebugValueField,
  type DebugStatus,
} from "../DebugVariables/DebugVariables";

export interface DebugWatchEntry {
  key: string;
  expression: string;
  value?: string;
  error?: string;
}

export interface DebugWatchState {
  status: DebugStatus;
  open: boolean;
  entries: readonly DebugWatchEntry[];
  editing: string | null;
}

export interface DebugWatchHandlers {
  onOpenChange: (open: boolean) => void;
  onAdd: (expression: string) => void;
  onEdit: (entry: DebugWatchEntry | null) => void;
  onChange: (entry: DebugWatchEntry, expression: string) => void;
  onRemove: (entry: DebugWatchEntry) => void;
}

export const DEBUG_WATCH_TEXT = {
  title: "Watch",
  empty: "Add an expression to watch it.",
  running: "not available while running",
  none: "not available until the story plays",
  add: "Add expression",
  addLabel: "Add an expression to watch",
  edit: "Edit",
  remove: "Remove",
  options: (expression: string) => `Options for ${expression}`,
  field: (expression: string) => `Change the expression ${expression}`,
} as const;

export type DebugWatchRow =
  | { card: "watch"; kind: "head"; open: boolean }
  | { card: "watch"; kind: "note"; text: string }
  | {
      card: "watch";
      kind: "entry";
      entry: DebugWatchEntry;
      status: DebugStatus;
      editing: boolean;
    }
  | { card: "watch"; kind: "add" }
  | { card: "watch"; kind: "end" };

export function debugWatchRows({
  status,
  open,
  entries,
  editing,
}: DebugWatchState): DebugWatchRow[] {
  const rows: DebugWatchRow[] = [{ card: "watch", kind: "head", open }];
  if (!open) {
    return rows;
  }
  if (!entries.length) {
    rows.push({ card: "watch", kind: "note", text: DEBUG_WATCH_TEXT.empty });
  }
  for (const entry of entries) {
    rows.push({
      card: "watch",
      kind: "entry",
      entry,
      status,
      editing: entry.key === editing,
    });
  }
  rows.push({ card: "watch", kind: "add" }, { card: "watch", kind: "end" });
  return rows;
}

export const debugWatchRowHeight = (row: DebugWatchRow) =>
  row.kind === "head"
    ? PANEL_CARD_HEIGHT.head
    : row.kind === "end"
      ? PANEL_CARD_HEIGHT.end
      : row.kind === "note"
        ? PANEL_CARD_HEIGHT.note
        : VIRTUAL_LIST_ROW_HEIGHT.compact;

export const debugWatchRowKey = (row: DebugWatchRow) =>
  row.kind === "entry" ? `watch:entry:${row.entry.key}` : `watch:${row.kind}`;

function WatchValue({ entry, status }: { entry: DebugWatchEntry; status: DebugStatus }) {
  if (status !== "paused") {
    return <span class="font-sans italic">{DEBUG_WATCH_TEXT[status]}</span>;
  }
  if (entry.error) {
    return (
      <span
        title={entry.error}
        class="inline-flex items-center gap-1 font-sans text-warning [&>svg]:size-3.5 [&>svg]:flex-none"
      >
        <WarningIcon />
        {entry.error}
      </span>
    );
  }
  return <>{entry.value ?? ""}</>;
}

function WatchMenu({
  entry,
  handlers,
}: {
  entry: DebugWatchEntry;
  handlers: DebugWatchHandlers;
}) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label={DEBUG_WATCH_TEXT.options(entry.expression)}
          class="flex-none text-muted"
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[180px]">
        <DropdownItem onSelect={() => handlers.onEdit(entry)}>
          <PencilIcon class="text-muted" />
          {DEBUG_WATCH_TEXT.edit}
        </DropdownItem>
        <DropdownItem class="text-error" onSelect={() => handlers.onRemove(entry)}>
          <TrashIcon />
          {DEBUG_WATCH_TEXT.remove}
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}

function AddField({ onAdd }: { onAdd: (expression: string) => void }) {
  return (
    <ListRow
      size="compact"
      label={
        <TextField
          width="full"
          font="mono"
          placeholder={DEBUG_WATCH_TEXT.add}
          aria-label={DEBUG_WATCH_TEXT.addLabel}
          onKeyDown={(e) => {
            const input = e.currentTarget;
            if (e.key === "Enter" && input.value.trim()) {
              e.preventDefault();
              onAdd(input.value.trim());
              input.value = "";
            }
          }}
        />
      }
    />
  );
}

export function DebugWatchRowView({
  row,
  handlers,
}: {
  row: DebugWatchRow;
  handlers: DebugWatchHandlers;
}) {
  switch (row.kind) {
    case "head":
      return (
        <PanelCardHead
          title={DEBUG_WATCH_TEXT.title}
          open={row.open}
          onOpenChange={handlers.onOpenChange}
        />
      );
    case "note":
      return <PanelCardNote>{row.text}</PanelCardNote>;
    case "entry":
      return (
        <PanelCardRow part="body">
          {row.editing ? (
            <ListRow
              size="compact"
              label={
                <DebugValueField
                  label={DEBUG_WATCH_TEXT.field(row.entry.expression)}
                  initial={row.entry.expression}
                  onCommit={(expression) =>
                    expression.trim()
                      ? handlers.onChange(row.entry, expression.trim())
                      : handlers.onEdit(null)
                  }
                  onCancel={() => handlers.onEdit(null)}
                />
              }
            />
          ) : (
            <ListRow
              size="compact"
              label={
                <DebugNameValue
                  name={row.entry.expression}
                  value={<WatchValue entry={row.entry} status={row.status} />}
                />
              }
              actions={<WatchMenu entry={row.entry} handlers={handlers} />}
            />
          )}
        </PanelCardRow>
      );
    case "add":
      return (
        <PanelCardRow part="body">
          <AddField onAdd={handlers.onAdd} />
        </PanelCardRow>
      );
    case "end":
      return <PanelCardRow part="end" />;
  }
}
