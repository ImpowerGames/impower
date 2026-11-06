import { useComputed } from "@preact/signals";
import type { ComponentChildren } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import { ToolPanel, ToolPanelAnchor, ToolPanelRoot } from "../tool-panel";
import { ChangeColorView } from "./ChangeColor";

type WorkspaceWindow =
  (typeof import("../../workspace/Workspace"))["Workspace"]["window"];

const withWindow = async <T,>(
  act: (win: WorkspaceWindow) => T | Promise<T>,
): Promise<T> => {
  const { Workspace } = await import("../../workspace/Workspace");
  return act(Workspace.window);
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

export type ChangeColorPanelProps = {
  children?: ComponentChildren;
};

export function ChangeColorPanel({ children }: ChangeColorPanelProps) {
  const target = useComputed(() => workspace.state.value.screen?.changeColor)
    .value;
  const open = !!target;

  const returnTo = useRef<HTMLElement | null>(null);
  const wasOpen = useRef(false);
  if (open && !wasOpen.current && typeof document !== "undefined") {
    returnTo.current = deepActiveElement();
  }
  wasOpen.current = open;

  const [colors, setColors] = useState<string[]>([]);
  useEffect(() => {
    if (!target) return;
    let current = true;
    void withWindow((win) => win.readStoryColors()).then((found) => {
      if (current) setColors(found);
    });
    return () => {
      current = false;
    };
  }, [target]);

  const close = () => void withWindow((win) => win.closeChangeColor());

  return (
    <ToolPanelRoot open={open} onOpen={() => {}} onClose={close}>
      <ToolPanelAnchor>
        <div class="flex flex-none flex-col">{children}</div>
      </ToolPanelAnchor>
      <ToolPanel
        open={open}
        title="Change color"
        onClose={close}
        returnFocus={() => returnTo.current}
      >
        {target && (
          <ChangeColorView
            key={`${target.filename}:${target.range.start.line}:${target.range.start.character}:${target.value}`}
            value={target.value}
            color={target.color}
            colors={colors}
            onUse={(value) => withWindow((win) => win.applyChangeColor(value))}
          />
        )}
      </ToolPanel>
    </ToolPanelRoot>
  );
}

export default ChangeColorPanel;
