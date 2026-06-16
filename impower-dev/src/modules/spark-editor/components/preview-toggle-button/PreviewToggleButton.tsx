import { Button, Edit, Eye } from "@impower/impower-ui/components";
import { useEffect, useState } from "preact/hooks";

export const propDefaults = {};
export type PreviewToggleButtonProps = Partial<typeof propDefaults>;

/**
 * Mobile "VIEW / EDIT" toggle. When the preview pane is collapsed, the user
 * sees "VIEW" + eye icon and clicking it expands the preview. When expanded,
 * they see "EDIT" + pencil icon and clicking returns to the editor.
 *
 * Bound to `workspace.state.preview.revealed` via the DidExpandPreviewPane /
 * DidCollapsePreviewPane messages so the visual state stays in sync no
 * matter what triggered the toggle (this button, a keyboard shortcut, etc.).
 */
export default function PreviewToggleButton(_props: PreviewToggleButtonProps) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let dispose: (() => void) | undefined;
    Promise.all([
      import("@impower/spark-editor-protocol/src/protocols/MessageProtocol"),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DidExpandPreviewPaneMessage"
      ),
      import(
        "@impower/spark-editor-protocol/src/protocols/window/DidCollapsePreviewPaneMessage"
      ),
    ]).then(
      ([
        { MessageProtocol },
        { DidExpandPreviewPaneMessage },
        { DidCollapsePreviewPaneMessage },
      ]) => {
        const onProtocol = (e: Event) => {
          if (!(e instanceof CustomEvent)) return;
          if (DidExpandPreviewPaneMessage.type.is(e.detail)) setActive(true);
          else if (DidCollapsePreviewPaneMessage.type.is(e.detail))
            setActive(false);
        };
        window.addEventListener(MessageProtocol.event, onProtocol);
        dispose = () =>
          window.removeEventListener(MessageProtocol.event, onProtocol);
      },
    );
    return () => dispose?.();
  }, []);

  const onClick = async () => {
    const next = !active;
    setActive(next);
    const { Workspace } = await import("../../workspace/Workspace");
    if (next) Workspace.window.expandedPreviewPane();
    else Workspace.window.collapsedPreviewPane();
  };

  const Icon = active ? Edit : Eye;
  const label = active ? "EDIT" : "VIEW";

  return (
    <Button
      variant="secondary"
      aria-label="Toggle Preview"
      aria-pressed={active}
      onClick={onClick}
      class="mr-2 h-9 w-[84px] gap-1.5 px-2.5 text-sm font-semibold"
    >
      <Icon class="size-[18px]" />
      {label}
    </Button>
  );
}
