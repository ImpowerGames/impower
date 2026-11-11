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
import {
  ADD_ROWS,
  isPickerRow,
  rowDisabled,
  type AddRow,
  type PickerRow,
} from "./addRows";
import AssetPicker from "./AssetPicker";
import { intents } from "./workspaceIntents";

type WorkspaceWindow = Awaited<ReturnType<typeof intents>>["window"];

const withWindow = async <T,>(
  act: (win: WorkspaceWindow) => T | Promise<T>,
): Promise<T> => act((await intents()).window);

export const toggleAddPanel = () =>
  void intents().then((Workspace) => {
    if (workspace.state.peek().screen?.addPanel) {
      Workspace.window.closeAddPanel();
      return;
    }
    Workspace.search.close();
    Workspace.window.openAddPanel();
  });

const TITLE = "Add to script";
const BACK_LABEL = "Back to add options";
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
  onPick,
}: {
  inScene: boolean | undefined;
  onAdd: (construct: InsertConstruct) => void;
  onPick: (row: PickerRow) => void;
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
            icon={<row.Icon />}
            label={<strong class="block font-semibold">{row.label}</strong>}
            description={row.help}
            trailing={isPickerRow(row) ? <ArrowIcon /> : undefined}
            aria-disabled={disabled ? "true" : undefined}
            data-add-construct={row.construct}
            onClick={() => {
              if (disabled) return;
              if (isPickerRow(row)) onPick(row);
              else onAdd(row.construct);
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
  const [picker, setPicker] = useState<PickerRow | null>(null);
  useEffect(() => {
    if (!open) {
      setContext(null);
      setPicker(null);
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

  const add = (construct: InsertConstruct, name?: string) => {
    returnTo.current?.focus({ preventScroll: true });
    void withWindow((win) => win.insertConstruct(filename, construct, name));
  };

  const leave = () => void withWindow((win) => win.closeAddPanel());

  const back = (row: AddRow) => {
    setPicker(null);
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLElement>(`[data-add-construct="${row.construct}"]`)
        ?.focus({ preventScroll: true }),
    );
  };

  return (
    <ToolPanelRoot
      presentation={phone ? "keyboard" : undefined}
      open={open}
      onOpen={toggleAddPanel}
      onClose={close}
    >
      {!phone && <AddTrigger open={open} disabled={!canEdit} />}
      <ToolPanel
        open={open}
        title={picker?.label ?? TITLE}
        closeLabel={CLOSE_LABEL}
        closeButton="trigger"
        anchoring="trigger"
        onClose={close}
        onBack={picker ? () => back(picker) : undefined}
        backLabel={BACK_LABEL}
        scroll={!picker}
        keepOpenOn={(target) => !!target.closest(TOOLBARS)}
        returnFocus={() => returnTo.current}
      >
        {picker ? (
          <AssetPicker
            key={picker.construct}
            filename={filename}
            row={picker}
            onInsert={(name) => add(picker.construct, name)}
            onLeave={leave}
          />
        ) : (
          <AddRows inScene={context?.inScene} onAdd={add} onPick={setPicker} />
        )}
      </ToolPanel>
    </ToolPanelRoot>
  );
}
