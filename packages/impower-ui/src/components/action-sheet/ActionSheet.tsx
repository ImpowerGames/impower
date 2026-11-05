import { useEffect, useState } from "preact/hooks";
import Button from "../button/Button";
import { DialogTitle, Sheet } from "../dialog/Dialog";

export type ActionSheetItem =
  | {
      label: string;
      disabled?: boolean;
      onSelect: () => void;
    }
  | { type: "separator" };

export type ActionSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  items: readonly ActionSheetItem[];
  class?: string;
};

export function ActionSheet({
  open,
  onOpenChange,
  title,
  items,
  class: className,
}: ActionSheetProps) {
  const [shown, setShown] = useState(items);
  useEffect(() => {
    if (open) {
      setShown(items);
    }
  }, [open, items]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange} flush class={className}>
      <DialogTitle class="sr-only">{title}</DialogTitle>
      <div
        role="menu"
        aria-label={title}
        class="flex flex-col p-2 pb-[max(8px,env(safe-area-inset-bottom))]"
      >
        {shown.map((item, index) =>
          "type" in item ? (
            <div key={index} role="separator" class="mx-2 my-1.5 h-px bg-edge" />
          ) : (
            <Button
              key={index}
              role="menuitem"
              variant="quiet"
              class="w-full justify-start text-[15px]/[1.4] font-normal"
              disabled={item.disabled}
              onClick={() => item.onSelect()}
            >
              {item.label}
            </Button>
          ),
        )}
      </div>
    </Sheet>
  );
}

export default ActionSheet;
