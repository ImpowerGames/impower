import { Button, Edit, Eye } from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type PreviewToggleButtonProps = Partial<typeof propDefaults>;

/**
 * Mobile "VIEW / EDIT" toggle. Derives its state directly from the reactive
 * store (`workspace.state.preview.revealed`): collapsed shows "VIEW" + eye and
 * clicking expands the preview; expanded shows "EDIT" + pencil and clicking
 * returns to the editor. Reading the signal keeps it in sync no matter what
 * triggered the toggle (this button, a keyboard shortcut, …) — the click just
 * dispatches the intent and the button re-renders from the store.
 */
export default function PreviewToggleButton(_props: PreviewToggleButtonProps) {
  const active = useComputed(
    () => workspace.state.value.preview?.revealed ?? false,
  ).value;

  const onClick = async () => {
    const { Workspace } = await import("../../workspace/Workspace");
    if (active) {
      Workspace.window.collapsePreviewPane();
    } else {
      Workspace.window.expandPreviewPane();
    }
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
