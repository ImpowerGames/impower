import Button, { type ButtonSize } from "../button/Button";
import {
  DropdownContent,
  DropdownItem,
  DropdownRoot,
  DropdownTrigger,
} from "../dropdown/Dropdown";
import { ChevronDownIcon } from "../icon/icons.generated";

export const FIX_MENU_LABEL = "Fix";

const BUSY = "aria-busy:cursor-progress aria-busy:opacity-40";

export type FixMenuSize = Extract<ButtonSize, "default" | "compact">;

export interface FixMenuAction {
  name: string;
}

export type FixMenuProps<A extends FixMenuAction> = {
  size?: FixMenuSize;
  actions: readonly A[];
  onChoose: (action: A) => void;
  onOpenChange?: (open: boolean) => void;
  busy?: boolean;
  class?: string;
};

export function FixMenu<A extends FixMenuAction>({
  actions,
  onChoose,
  onOpenChange,
  size,
  busy = false,
  class: className,
}: FixMenuProps<A>) {
  const [only] = actions;
  if (!only) {
    return null;
  }
  const choose = (action: A) => {
    if (!busy) {
      onChoose(action);
    }
  };
  const state = busy
    ? { "aria-busy": true, "aria-disabled": true }
    : {};
  if (actions.length === 1) {
    return (
      <Button
        data-fix-menu=""
        {...state}
        size={size}
        class={`${BUSY} ${className ?? ""}`}
        onClick={() => choose(only)}
      >
        {only.name}
      </Button>
    );
  }
  return (
    <DropdownRoot onOpenChange={onOpenChange}>
      <DropdownTrigger asChild>
        <Button
          data-fix-menu=""
          {...state}
          size={size}
          class={`${BUSY} ${className ?? ""}`}
        >
          {FIX_MENU_LABEL}
          <ChevronDownIcon aria-hidden="true" />
        </Button>
      </DropdownTrigger>
      <DropdownContent align="end">
        {actions.map((action, index) => (
          <DropdownItem key={index} onSelect={() => choose(action)}>
            {action.name}
          </DropdownItem>
        ))}
      </DropdownContent>
    </DropdownRoot>
  );
}

export default FixMenu;
