import {
  Button,
  FollowIcon,
  PencilIcon,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export const propDefaults = {};
export type PreviewToggleButtonProps = Partial<typeof propDefaults>;

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

  const Icon = active ? PencilIcon : FollowIcon;
  const label = active ? "EDIT" : "VIEW";

  return (
    <Button
      aria-label="Toggle Preview"
      aria-pressed={active}
      onClick={onClick}
      size="pill"
    class="mr-1 w-[92px]"
    >
      <Icon />
      {label}
    </Button>
  );
}
