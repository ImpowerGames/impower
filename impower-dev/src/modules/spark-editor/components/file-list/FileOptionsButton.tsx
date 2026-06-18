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
import { useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";

export type FileOptionsButtonProps = {
  onRename: () => void;
  onDelete: () => void;
};

const TRIGGER_CLASS =
  "mr-2 rounded-full text-foreground/50 hover:text-foreground";

/**
 * Per-row 3-dots options menu with Rename + Delete. Both items are disabled
 * while the workspace is syncing.
 *
 * PERF: a full Radix DropdownMenu per row was the dominant cost when scrolling
 * a large list (each row mount set up Radix context/refs/portal). Since the
 * vast majority of rows never open their menu, we render a plain button until
 * it's first activated, then mount the real Radix menu (which opens itself via
 * `defaultOpen`) and unmount it again when it closes.
 */
export default function FileOptionsButton({
  onRename,
  onDelete,
}: FileOptionsButtonProps) {
  const [armed, setArmed] = useState(false);
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

  if (!armed) {
    // Lightweight form: a plain button. Arms the real menu on first click.
    return (
      <Button
        variant="ghost"
        size="icon"
        aria-label="Options"
        class={TRIGGER_CLASS}
        disabled={disabled}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          setArmed(true);
        }}
      >
        <DotsVertical class="size-5" />
      </Button>
    );
  }

  return (
    <DropdownRoot
      defaultOpen
      onOpenChange={(open) => {
        if (!open) setArmed(false);
      }}
    >
      <DropdownTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Options"
          class={TRIGGER_CLASS}
          disabled={disabled}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <DotsVertical class="size-5" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end" sideOffset={4}>
        <DropdownItem disabled={disabled} onSelect={() => onRename()}>
          <Pencil class="size-4" />
          Rename
        </DropdownItem>
        <DropdownItem disabled={disabled} onSelect={() => onDelete()}>
          <Trash class="size-4" />
          Delete
        </DropdownItem>
      </DropdownContent>
    </DropdownRoot>
  );
}
