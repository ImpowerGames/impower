import {
  Button,
  DropdownCheckboxItem,
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
  TreeToggle,
  VIRTUAL_LIST_ROW_HEIGHT,
  WarningIcon,
} from "@impower/impower-ui/components";
import type { ComponentChildren } from "preact";
import { useEffect, useRef } from "preact/hooks";

export type DebugStatus = "none" | "running" | "paused";

export interface DebugVariableNode {
  key: string;
  name: string;
  value: string;
  type?: string;
  expandable: boolean;
  expanded: boolean;
  editable: boolean;
  breakable: boolean;
  breaking: boolean;
  message?: string;
  children?: readonly DebugVariableNode[];
}

export interface DebugVariablesState {
  status: DebugStatus;
  open: boolean;
  scopes: readonly DebugVariableNode[];
  editing: string | null;
}

export interface DebugVariablesHandlers {
  onOpenChange: (open: boolean) => void;
  onToggle: (node: DebugVariableNode) => void;
  onEdit: (node: DebugVariableNode | null) => void;
  onSetValue: (node: DebugVariableNode, value: string) => void;
  onBreakOnChange: (node: DebugVariableNode, on: boolean) => void;
}

export const DEBUG_VARIABLES_TEXT = {
  title: "Variables",
  none: "Play the story to inspect it.",
  running: "Pause the story to inspect it.",
  empty: "This frame holds no values.",
  change: "Change value",
  breakOnChange: "Break when value changes",
  options: (name: string) => `Options for ${name}`,
  toggle: (name: string, expanded: boolean) =>
    `${expanded ? "Collapse" : "Expand"} ${name}`,
  field: (name: string) => `New value for ${name}`,
  edit: (name: string, value: string) => `Change ${name}, now ${value}`,
  breaking: "Breaks when this value changes",
} as const;

export type DebugVariablesRow =
  | { card: "variables"; kind: "head"; open: boolean }
  | { card: "variables"; kind: "note"; text: string }
  | {
      card: "variables";
      kind: "node";
      node: DebugVariableNode;
      depth: number;
      editing: boolean;
    }
  | { card: "variables"; kind: "message"; key: string; text: string; depth: number }
  | { card: "variables"; kind: "end" };

export function debugVariablesRows({
  status,
  open,
  scopes,
  editing,
}: DebugVariablesState): DebugVariablesRow[] {
  const rows: DebugVariablesRow[] = [{ card: "variables", kind: "head", open }];
  if (!open) {
    return rows;
  }
  const walk = (nodes: readonly DebugVariableNode[], depth: number) => {
    for (const node of nodes) {
      rows.push({
        card: "variables",
        kind: "node",
        node,
        depth,
        editing: node.key === editing,
      });
      if (node.message) {
        rows.push({
          card: "variables",
          kind: "message",
          key: node.key,
          text: node.message,
          depth: depth + 1,
        });
      }
      if (node.expanded && node.children) {
        walk(node.children, depth + 1);
      }
    }
  };
  if (status !== "paused") {
    rows.push({ card: "variables", kind: "note", text: DEBUG_VARIABLES_TEXT[status] });
  } else if (!scopes.length) {
    rows.push({ card: "variables", kind: "note", text: DEBUG_VARIABLES_TEXT.empty });
  } else {
    walk(scopes, 0);
  }
  rows.push({ card: "variables", kind: "end" });
  return rows;
}

export const debugVariablesRowHeight = (row: DebugVariablesRow) =>
  row.kind === "head"
    ? PANEL_CARD_HEIGHT.head
    : row.kind === "end"
      ? PANEL_CARD_HEIGHT.end
      : row.kind === "note"
        ? PANEL_CARD_HEIGHT.note
        : VIRTUAL_LIST_ROW_HEIGHT.compact;

export const debugVariablesRowKey = (row: DebugVariablesRow) =>
  row.kind === "node"
    ? `variables:node:${row.node.key}`
    : row.kind === "message"
      ? `variables:message:${row.key}`
      : `variables:${row.kind}`;

export function DebugValueField({
  label,
  initial,
  onCommit,
  onCancel,
}: {
  label: string;
  initial: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);

  const settle = (commit: boolean) => {
    if (settled.current) {
      return;
    }
    settled.current = true;
    if (commit) {
      onCommit(input.current?.value ?? initial);
    } else {
      onCancel();
    }
  };

  return (
    <TextField
      ref={input}
      width="full"
      font="mono"
      aria-label={label}
      defaultValue={initial}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          settle(true);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          settle(false);
        }
      }}
      onBlur={() => settle(false)}
    />
  );
}

export function DebugRowMessage({ text, depth }: { text: string; depth: number }) {
  return (
    <ListRow
      size="compact"
      depth={depth}
      icon={
        <span class="flex flex-none text-warning [&>svg]:size-4">
          <WarningIcon />
        </span>
      }
      overflow="wrap"
      label={
        <span role="alert" class="text-warning">
          {text}
        </span>
      }
    />
  );
}

export function DebugNameValue({
  name,
  value,
}: {
  name: ComponentChildren;
  value: ComponentChildren;
}) {
  return (
    <span class="flex min-w-0 items-baseline gap-2">
      <span class="w-2/5 flex-none [--fade:24px] fade-edge text-ink">
        {name}
      </span>
      <span class="min-w-0 flex-1 font-mono whitespace-nowrap text-muted [--fade:24px] fade-edge">
        {value}
      </span>
    </span>
  );
}

function VariableMenu({
  node,
  handlers,
}: {
  node: DebugVariableNode;
  handlers: DebugVariablesHandlers;
}) {
  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="quiet"
          size="icon"
          aria-label={DEBUG_VARIABLES_TEXT.options(node.name)}
          class="flex-none text-muted"
        >
          <MoreVerticalIcon />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" class="min-w-[220px]">
        {node.editable && (
          <DropdownItem onSelect={() => handlers.onEdit(node)}>
            <PencilIcon class="text-muted" />
            {DEBUG_VARIABLES_TEXT.change}
          </DropdownItem>
        )}
        {node.breakable && (
          <DropdownCheckboxItem
            checked={node.breaking}
            onCheckedChange={(on) => handlers.onBreakOnChange(node, on)}
          >
            {DEBUG_VARIABLES_TEXT.breakOnChange}
          </DropdownCheckboxItem>
        )}
      </DropdownContent>
    </DropdownRoot>
  );
}

function VariableNodeRow({
  node,
  depth,
  editing,
  handlers,
}: {
  node: DebugVariableNode;
  depth: number;
  editing: boolean;
  handlers: DebugVariablesHandlers;
}) {
  const leading = node.expandable ? (
    <TreeToggle
      expanded={node.expanded}
      label={DEBUG_VARIABLES_TEXT.toggle(node.name, node.expanded)}
      onToggle={() => handlers.onToggle(node)}
    />
  ) : (
    <span aria-hidden="true" class="w-11 flex-none" />
  );
  if (editing) {
    return (
      <ListRow
        size="compact"
        depth={depth}
        leading={leading}
        overflow="self"
        label={
          <DebugNameValue
            name={node.name}
            value={
              <DebugValueField
                label={DEBUG_VARIABLES_TEXT.field(node.name)}
                initial={node.value}
                onCommit={(value) => handlers.onSetValue(node, value)}
                onCancel={() => handlers.onEdit(null)}
              />
            }
          />
        }
      />
    );
  }
  const menu = node.editable || node.breakable;
  return (
    <ListRow
      size="compact"
      depth={depth}
      leading={leading}
      overflow="self"
      label={<DebugNameValue name={node.name} value={node.value} />}
      trailing={
        node.breaking ? (
          <span
            role="img"
            aria-label={DEBUG_VARIABLES_TEXT.breaking}
            title={DEBUG_VARIABLES_TEXT.breaking}
            class="size-2 flex-none rounded-full bg-accent"
          />
        ) : undefined
      }
      title={node.type ? `${node.name}: ${node.type}` : undefined}
      aria-label={
        node.editable ? DEBUG_VARIABLES_TEXT.edit(node.name, node.value) : undefined
      }
      onClick={node.editable ? () => handlers.onEdit(node) : undefined}
      actions={menu ? <VariableMenu node={node} handlers={handlers} /> : undefined}
    />
  );
}

export function DebugVariablesRowView({
  row,
  handlers,
}: {
  row: DebugVariablesRow;
  handlers: DebugVariablesHandlers;
}) {
  switch (row.kind) {
    case "head":
      return (
        <PanelCardHead
          title={DEBUG_VARIABLES_TEXT.title}
          open={row.open}
          onOpenChange={handlers.onOpenChange}
        />
      );
    case "note":
      return <PanelCardNote>{row.text}</PanelCardNote>;
    case "node":
      return (
        <PanelCardRow part="body">
          <VariableNodeRow
            node={row.node}
            depth={row.depth}
            editing={row.editing}
            handlers={handlers}
          />
        </PanelCardRow>
      );
    case "message":
      return (
        <PanelCardRow part="body">
          <DebugRowMessage text={row.text} depth={row.depth} />
        </PanelCardRow>
      );
    case "end":
      return <PanelCardRow part="end" />;
  }
}
