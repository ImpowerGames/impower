import {
  Button,
  DotsVertical,
  Pencil,
  Trash,
} from "@impower/impower-ui/components";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "@impower/impower-ui/components";
import { useComputed } from "@preact/signals";
import workspace from "../../workspace/WorkspaceStore";

export type FileOptionsButtonProps = {
  onRename: () => void;
  onDelete: () => void;
};

/**
 * Per-row 3-dots options menu. Click opens a Radix DropdownMenu with
 * Rename + Delete. Both items are disabled while the workspace is syncing
 * — matches the legacy `<se-file-options-button>` `setup()` logic.
 */
export default function FileOptionsButton({
  onRename,
  onDelete,
}: FileOptionsButtonProps) {
  const disabledSig = useComputed(() => {
    const status = workspace.signals.syncStatus.value;
    return (
      status === "syncing" ||
      status === "loading" ||
      status === "importing" ||
      status === "exporting"
    );
  });
  const disabled = disabledSig.value;

  return (
    <DropdownRoot>
      <DropdownTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Options"
          class="mr-2 rounded-full text-foreground/50 hover:text-foreground"
          onClick={(e) => e.stopPropagation()}
        >
          <DotsVertical class="size-5" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" sideOffset={4}>
        <DropdownItem
          disabled={disabled}
          onSelect={() => onRename()}
        >
          <Pencil class="size-4" />
          Rename
        </DropdownItem>
        <DropdownItem
          disabled={disabled}
          onSelect={() => onDelete()}
        >
          <Trash class="size-4" />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
