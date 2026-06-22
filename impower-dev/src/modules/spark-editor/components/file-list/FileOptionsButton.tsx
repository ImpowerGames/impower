import {
  Button,
  DotsVertical,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
} from "@impower/impower-ui/components";
import { signal, useComputed, useSignalEffect } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import FileMenuItems, { type FileMenuItemsProps } from "./FileMenuItems";

export type FileOptionsButtonProps = FileMenuItemsProps;

// Identity of the row whose options menu is currently open — only one at a time.
// Opening a row reassigns this; every other instance's `useSignalEffect` then
// sees its key no longer matches and disarms (closing its menu). This is needed
// because the trigger stops event propagation (so the row click doesn't open the
// file), which also prevents Radix's outside-click from dismissing a sibling
// row's menu — without coordination they'd stack open.
const openOptionsKey = signal<symbol | null>(null);

const TRIGGER_CLASS =
  "mr-3 rounded-full text-foreground/50 hover:text-foreground";

/**
 * Per-row 3-dots options menu (Rename / Find usages / Duplicate / Download /
 * Delete — see FileMenuItems). Both the 3-dots and the desktop right-click
 * context menu (FileItem) render the same items.
 *
 * PERF: a full Radix DropdownMenu per row was the dominant cost when scrolling
 * a large list (each row mount set up Radix context/refs/portal). Since the
 * vast majority of rows never open their menu, we render a plain button until
 * it's first activated, then mount the real Radix menu (which opens itself via
 * `defaultOpen`) and unmount it again when it closes.
 */
export default function FileOptionsButton(props: FileOptionsButtonProps) {
  const [armed, setArmed] = useState(false);
  // Stable per-instance key for the single-open coordination above.
  const keyRef = useRef<symbol | null>(null);
  if (!keyRef.current) {
    keyRef.current = Symbol();
  }
  // Close this menu when another row claims the open slot. (Reading no local
  // state keeps it correct: setArmed(false) is a no-op when already closed.)
  useSignalEffect(() => {
    if (openOptionsKey.value !== keyRef.current) {
      setArmed(false);
    }
  });
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
          // Claim the single open slot (closes any other row's menu), then arm.
          openOptionsKey.value = keyRef.current;
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
        if (!open) {
          // Keep the lazy-armed menu mounted briefly so its exit transition can
          // finish before we drop the Radix root. Hold the single-open slot
          // until then too, so our own useSignalEffect doesn't disarm us
          // mid-exit (it disarms when the slot key no longer matches).
          window.setTimeout(() => {
            setArmed(false);
            if (openOptionsKey.value === keyRef.current) {
              openOptionsKey.value = null;
            }
          }, 250);
        }
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
      <DropdownContent
        align="end"
        sideOffset={4}
        // Don't let Radix yank focus back to the 3-dots trigger when the menu
        // closes — "Rename" puts the row into inline-edit mode and focuses its
        // input, and the trigger is unmounted moments later by the lazy-arm
        // teardown, so the restored focus would land on <body> and the rename
        // field would lose its selection the instant it opened.
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <FileMenuItems {...props} />
      </DropdownContent>
    </DropdownRoot>
  );
}
