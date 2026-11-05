import {
  Button,
  DropdownContent,
  DropdownRoot,
  DropdownTrigger,
  MoreVerticalIcon,
} from "@impower/impower-ui/components";
import { useComputed, useSignalEffect } from "@preact/signals";
import type { Ref } from "preact";
import { useRef, useState } from "preact/hooks";
import workspace from "../../workspace/WorkspaceStore";
import FileMenuItems, { type FileMenuItemsProps } from "./FileMenuItems";
import { openRowMenu } from "./openRowMenu";

export type FileOptionsButtonProps = FileMenuItemsProps & {
  buttonRef?: Ref<HTMLButtonElement>;
};

const TRIGGER_CLASS =
  "mr-3 text-muted";

export default function FileOptionsButton({
  buttonRef,
  ...props
}: FileOptionsButtonProps) {
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
        ref={buttonRef}
        variant="quiet"
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
        <MoreVerticalIcon class="size-5" />
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
          ref={buttonRef}
          variant="quiet"
          size="icon"
          aria-label="Options"
          class={TRIGGER_CLASS}
          disabled={disabled}
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreVerticalIcon class="size-5" />
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
