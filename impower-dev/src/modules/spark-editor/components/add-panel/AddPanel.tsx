import {
  ArrowIcon,
  Button,
  CloseIcon,
  ListRow,
  PlusIcon,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import type {
  InsertConstruct,
  InsertContext,
} from "@impower/codemirror-vscode-lsp-client/src/insert";
import { useComputed } from "@preact/signals";
import { useEffect, useRef, useState } from "preact/hooks";
import { useCaretPosition } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import {
  ToolPanel,
  ToolPanelRoot,
  ToolPanelTrigger,
  type ToolPanelCloseReason,
} from "../tool-panel";
import { ADD_ROWS, rowDisabled } from "./addRows";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async <T,>(
  act: (win: WorkspaceWindow) => T | Promise<T>,
): Promise<T> => {
  const { Workspace } = await import("../../workspace/Workspace");
  return act(Workspace.window);
};

const TITLE = "Add to script";
const CLOSE_LABEL = "Close add menu";

const deepActiveElement = (): HTMLElement | null => {
  let element = document.activeElement;
  while (element?.shadowRoot?.activeElement) {
    element = element.shadowRoot.activeElement;
  }
  return element instanceof HTMLElement && element !== document.body
    ? element
    : null;
};

const keepFocus = (event: PointerEvent) => event.preventDefault();

const TOOLBARS = "[data-writer-bar], .cm-keyboard-toolbar";

function AddTrigger({ open, disabled }: { open: boolean; disabled: boolean }) {
  return (
    <ToolPanelTrigger>
      {open ? (
        <Button
          variant="quiet"
          size="icon"
          aria-label={CLOSE_LABEL}
          title={CLOSE_LABEL}
          aria-expanded
          class="text-muted"
          onPointerDown={keepFocus}
          data-add-trigger
        >
          <CloseIcon />
        </Button>
      ) : (
        <Button
          aria-expanded={false}
          disabled={disabled}
          class="bg-transparent text-accent"
          onPointerDown={keepFocus}
          data-add-trigger
        >
          <PlusIcon />
          Add
        </Button>
      )}
    </ToolPanelTrigger>
  );
}

function AddRows({
  inScene,
  onAdd,
}: {
  inScene: boolean | undefined;
  onAdd: (construct: InsertConstruct) => void;
}) {
  return (
    <div class="p-1.5" data-add-rows>
      {ADD_ROWS.map((row) => {
        const disabled = rowDisabled(row, inScene);
        return (
          <ListRow
            key={row.construct}
            size="block"
            class="has-[button[aria-disabled=true]]:opacity-40 [&_svg:first-child]:text-accent!"
            icon={row.icon}
            label={<strong class="block font-semibold">{row.label}</strong>}
            description={row.help}
            trailing={row.picker ? <ArrowIcon /> : undefined}
            aria-disabled={disabled ? "true" : undefined}
            data-add-construct={row.construct}
            onClick={() => {
              if (!disabled) onAdd(row.construct);
            }}
          />
        );
      })}
      {inScene === false && (
        <p class="px-2.5 py-1.5 text-[12px]/[1.5] text-muted">
          Add a scene or move into one to use story blocks.
        </p>
      )}
    </div>
  );
}

export type AddPanelProps = {
  filename: string;
  canEdit: boolean;
};

export default function AddPanel({ filename, canEdit }: AddPanelProps) {
  const open = useComputed(
    () => !!workspace.state.value.screen?.addPanel,
  ).value;
  const phone = useLayout() === "phone";
  const caret = useCaretPosition(filename);

  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const active = deepActiveElement();
    returnTo.current = active?.closest(`[data-add-trigger], ${TOOLBARS}`)
      ? null
      : active;
  }
  wasOpen.current = open;

  const [context, setContext] = useState<InsertContext | null>(null);
  useEffect(() => {
    if (!open) {
      setContext(null);
      return;
    }
    let current = true;
    void withWindow((win) => win.readInsertContext(filename)).then((found) => {
      if (current) setContext(found);
    });
    return () => {
      current = false;
    };
  }, [open, filename, caret.line, caret.column]);

  const focusScript = () =>
    void withWindow((win) => win.executeEditorCommand(filename, "focus"));

  const close = (reason: ToolPanelCloseReason) => {
    void withWindow((win) => {
      win.closeAddPanel();
      if (reason !== "dismiss") {
        win.executeEditorCommand(filename, "focus");
      }
    });
    if (reason === "dismiss") {
      requestAnimationFrame(() => {
        if (!deepActiveElement()) focusScript();
      });
    }
  };

  const add = (construct: InsertConstruct) => {
    returnTo.current?.focus({ preventScroll: true });
    void withWindow((win) => win.insertConstruct(filename, construct));
  };

  return (
    <ToolPanelRoot
      presentation={phone ? "keyboard" : undefined}
      open={open}
      onOpen={() => void withWindow((win) => win.openAddPanel())}
      onClose={close}
    >
      {!phone && <AddTrigger open={open} disabled={!canEdit} />}
      <ToolPanel
        open={open}
        title={TITLE}
        closeLabel={CLOSE_LABEL}
        closeButton="trigger"
        anchoring="trigger"
        onClose={close}
        keepOpenOn={(target) => !!target.closest(TOOLBARS)}
        returnFocus={() => returnTo.current}
      >
        <AddRows inScene={context?.inScene} onAdd={add} />
      </ToolPanel>
    </ToolPanelRoot>
  );
}
