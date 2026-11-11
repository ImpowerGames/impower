import Button, { type ButtonSize } from "../button/Button";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "../dropdown/Dropdown";
import { ChevronDownIcon } from "../icon/icons.generated";

export const FIX_MENU_LABEL = "Fix";

export type FixMenuSize = Extract<ButtonSize, "default" | "compact">;

export interface FixMenuAction {
  name: string;
}

export type FixMenuProps<A extends FixMenuAction> = {
  size?: FixMenuSize;
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
  const [only] = actions;
  if (!only) {
    return null;
  }
  if (actions.length === 1) {
    return (
      <Button size={size} class={className} onClick={() => onChoose(only)}>
        {only.name}
      </Button>
    );
  }
  return (
    <DropdownRoot onOpenChange={onOpenChange}>
      <DropdownTrigger asChild>
        <Button size={size} class={className}>
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
