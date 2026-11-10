import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "../dropdown/Dropdown";
import { ChevronDownIcon } from "../icon/icons.generated";

export const FIX_MENU_LABEL = "Fix";

export const fixMenuVariants = cva("", {
  variants: {
    size: {
      default: "",
      compact: "min-h-8 px-2.5 text-[12px]/[1.4] pointer-coarse:min-h-11",
    },
  },
  defaultVariants: { size: "default" },
});

export type FixMenuSize = NonNullable<
  VariantProps<typeof fixMenuVariants>["size"]
>;

export interface FixMenuAction {
  name: string;
}

export type FixMenuProps<A extends FixMenuAction> = VariantProps<
  typeof fixMenuVariants
> & {
  actions: readonly A[];
  onChoose: (action: A) => void;
  onOpenChange?: (open: boolean) => void;
  class?: string;
};

export function FixMenu<A extends FixMenuAction>({
  actions,
  onChoose,
  onOpenChange,
  size,
  class: className,
}: FixMenuProps<A>) {
  const classes = cn(fixMenuVariants({ size }), className);
  const [only] = actions;
  if (!only) {
    return null;
  }
  if (actions.length === 1) {
    return (
      <Button class={classes} onClick={() => onChoose(only)}>
        {only.name}
      </Button>
    );
  }
  return (
    <DropdownRoot onOpenChange={onOpenChange}>
      <DropdownTrigger asChild>
        <Button class={classes}>
          {FIX_MENU_LABEL}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        {actions.map((action, index) => (
          <DropdownItem key={index} onSelect={() => onChoose(action)}>
            {action.name}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownRoot>
  );
}

export default FixMenu;
