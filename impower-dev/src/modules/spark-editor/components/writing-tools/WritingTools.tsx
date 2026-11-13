import { Button, MoreIcon } from "@impower/impower-ui/components";
import { useCoarsePointer, useLayout } from "@impower/impower-ui/layout";
import type { ReadEditorKeybindingsResult } from "@impower/spark-editor-protocol/src/protocols/editor/ReadEditorKeybindingsMessage";
import type { WritingToolsView } from "@impower/spark-editor-protocol/src/types";
import { useComputed } from "@preact/signals";
import type { ComponentChildren, VNode } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { isScriptUri, type NameAtCaret } from "../../workspace/nameAtCaret";
import { useCaretPosition } from "../../workspace/useActiveEditor";
import workspace from "../../workspace/WorkspaceStore";
import { openFind, withSearch } from "../find-references-rename";
import {
  ToolPanel,
  ToolPanelAnchor,
  ToolPanelRoot,
  ToolPanelTrigger,
  type ToolPanelCloseReason,
} from "../tool-panel";
import { ChangeColorView } from "./ChangeColor";
import ShortcutsSheet from "./ShortcutsSheet";
import { shortcutSections } from "./shortcuts";
import SparkdownGuide from "./SparkdownGuide";
import WritingToolsMenu, {
  type CommandRow,
  type NameAction,
} from "./WritingToolsMenu";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async <T,>(
  act: (win: WorkspaceWindow) => T | Promise<T>,
): Promise<T> => {
  const { Workspace } = await import("../../workspace/Workspace");
  return act(Workspace.window);
};

const TITLES: Record<WritingToolsView, string> = {
  menu: "Writing tools",
  guide: "Sparkdown guide",
  shortcuts: "Keyboard shortcuts",
  color: "Change color",
};

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

export function WritingToolsTrigger() {
  const open = useComputed(() => !!workspace.state.value.screen?.writingTools)
    .value;
  return (
    <ToolPanelTrigger>
      <Button
        variant="quiet"
        size="icon"
        aria-label="Writing tools"
        title="Writing tools"
        aria-expanded={open}
        class="aria-expanded:bg-tint aria-expanded:text-accent"
        onPointerDown={keepFocus}
        data-writing-tools-trigger
      >
        <MoreIcon />
      </Button>
    </ToolPanelTrigger>
  );
}

export type WritingToolsProps = {
  filename: string;
  canEdit: boolean;
  children: (trigger: VNode) => ComponentChildren;
};

export default function WritingTools({
  filename,
  canEdit,
  children,
}: WritingToolsProps) {
  const state = useComputed(() => workspace.state.value.screen?.writingTools)
    .value;
  const open = !!state;
  const view = state?.view ?? "menu";
  const phone = useLayout() === "phone";
  const coarse = useCoarsePointer();
  const caret = useCaretPosition(filename);

  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    const active = deepActiveElement();
    returnTo.current = active?.closest("[data-writing-tools-trigger]")
      ? null
      : active;
  }
  wasOpen.current = open;

  const shownView = useRef<WritingToolsView | null>(null);
  useEffect(() => {
    const previous = shownView.current;
    shownView.current = open ? view : null;
    if (!open || !previous || previous === view) return;
    const frame = requestAnimationFrame(() => {
      const target =
        view === "menu"
          ? document.querySelector<HTMLElement>("[data-writing-tools-view]")
          : document.querySelector<HTMLElement>(
              '[aria-label="Back to writing tools"]',
            );
      target?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, view]);

  const [name, setName] = useState<NameAtCaret | null>(null);
  useEffect(() => {
    setName(null);
    if (!open || view !== "menu") return;
    let current = true;
    void withWindow((win) => win.readNameAtCaret(filename)).then((found) => {
      if (current) setName(found);
    });
    return () => {
      current = false;
    };
  }, [open, view, filename, caret.line, caret.column]);

  const [keys, setKeys] = useState<ReadEditorKeybindingsResult | null>(null);
  useEffect(() => {
    setKeys(null);
    if (!open || view !== "shortcuts") return;
    let current = true;
    void withWindow((win) => win.readEditorKeybindings(filename)).then(
      (result) => {
        if (current) setKeys(result);
      },
    );
    return () => {
      current = false;
    };
  }, [open, view, filename]);

  const colorTarget = state?.color;
  const [storyColors, setStoryColors] = useState<string[]>([]);
  useEffect(() => {
    if (!colorTarget) return;
    let current = true;
    void withWindow((win) => win.readStoryColors()).then((found) => {
      if (current) setStoryColors(found);
    });
    return () => {
      current = false;
    };
  }, [colorTarget]);

  const workingElement = () => {
    const back = returnTo.current;
    return back?.isConnected ? back : null;
  };
  const focusScript = (win: WorkspaceWindow) => {
    if (workspace.effectiveScriptMode.peek() === "reading") return;
    win.executeEditorCommand(filename, "focus");
  };

  const close = (reason?: ToolPanelCloseReason) =>
    void withWindow((win) => {
      win.closeWritingTools();
      if ((reason === "close" || reason === "escape") && !workingElement()) {
        focusScript(win);
      }
    });
  const applyColor = (value: string) =>
    withWindow(async (win) => {
      const outcome = await win.applyChangeColor(value);
      if (outcome === "applied") {
        const back = workingElement();
        if (back) back.focus({ preventScroll: true });
        else focusScript(win);
      }
      return outcome;
    });
  const show = (next: WritingToolsView) =>
    void withWindow((win) => win.showWritingToolsView(next));
  const onName = (action: NameAction) => {
    const asset =
      action === "definition" && name?.definition && !isScriptUri(name.definition.uri)
        ? name.definition.uri
        : null;
    void withWindow((win) => {
      win.closeWritingTools();
      if (asset) {
        void win.showDocument(asset);
      } else if (action === "definition") {
        win.executeEditorCommand(filename, action);
      }
    });
    if (name && action !== "definition") {
      withSearch((search) =>
        action === "rename" ? search.openRename(name) : search.openReferences(name),
      );
    }
  };

  const onCommand = (row: CommandRow) =>
    void withWindow((win) => {
      if (row.closes) win.closeWritingTools();
      if (row.command === "search") {
        openFind();
      } else {
        win.executeEditorCommand(filename, row.command);
      }
    });

  const trigger = <WritingToolsTrigger />;

  return (
    <ToolPanelRoot
      presentation={phone ? "keyboard" : undefined}
      open={open}
      onOpen={() => void withWindow((win) => win.openWritingTools())}
      onClose={close}
    >
      <ToolPanelAnchor>{children(trigger)}</ToolPanelAnchor>
      <ToolPanel
        open={open}
        title={TITLES[view]}
        onClose={close}
        onBack={state?.fromMenu ? () => show("menu") : undefined}
        keepOpenOn={(target) =>
          !!target.closest("[data-writer-bar], .cm-keyboard-toolbar")
        }
        returnFocus={workingElement}
      >
        {view === "menu" ? (
          <WritingToolsMenu
            name={name}
            canEdit={canEdit}
            coarse={coarse}
            phone={phone}
            onView={show}
            onName={onName}
            onCommand={onCommand}
          />
        ) : view === "color" && colorTarget ? (
          <ChangeColorView
            key={`${colorTarget.filename}:${colorTarget.range.start.line}:${colorTarget.range.start.character}:${colorTarget.value}`}
            value={colorTarget.value}
            color={colorTarget.color}
            colors={storyColors}
            canEdit={canEdit}
            onUse={applyColor}
          />
        ) : view === "guide" ? (
          <SparkdownGuide />
        ) : (
          <ShortcutsSheet
            sections={keys ? shortcutSections(keys.commands) : null}
            mac={keys?.mac ?? false}
          />
        )}
      </ToolPanel>
    </ToolPanelRoot>
  );
}
