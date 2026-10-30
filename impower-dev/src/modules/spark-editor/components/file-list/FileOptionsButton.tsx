import {
  Button,
  DotsVertical,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
} from "@impower/impower-ui/components";
import { useComputed, useSignalEffect } from "@preact/signals";
import { useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import FileMenuItems, { type FileMenuItemsProps } from "./FileMenuItems";
import { openRowMenu } from "./openRowMenu";

export type FileOptionsButtonProps = FileMenuItemsProps;

const TRIGGER_CLASS =
  "mr-3 rounded-full text-foreground/50 hover:text-foreground";

export default function FileOptionsButton(props: FileOptionsButtonProps) {
  const [armed, setArmed] = useState(false);
  const keyRef = useRef<symbol | null>(null);
  if (!keyRef.current) {
    keyRef.current = Symbol();
  }
  useSignalEffect(() => {
    if (openRowMenu.value !== keyRef.current) {
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
          openRowMenu.value = keyRef.current;
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
          window.setTimeout(() => {
            setArmed(false);
            if (openRowMenu.value === keyRef.current) {
              openRowMenu.value = null;
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
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <FileMenuItems {...props} />
      </DropdownContent>
    </DropdownRoot>
  );
}
