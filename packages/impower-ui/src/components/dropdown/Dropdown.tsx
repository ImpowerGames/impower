// Thin re-export of Radix DropdownMenu pieces under impower-ui's roof so
// consumer packages (impower-dev) don't need their own copy of
// @radix-ui/react-dropdown-menu. Pre-skinned `Content` and `Item` variants
// match the rest of impower-ui's surface (engine-800 surface, hover state).
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";

// Re-exports — use these for the un-styled bits (Root, Trigger, Portal,
// Sub, Separator, etc.). Wrappers further down add impower-ui styling
// to the visible bits (Content, Item, CheckboxItem).
export const DropdownRoot = DropdownMenuPrimitive.Root;
export const DropdownTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownPortal = DropdownMenuPrimitive.Portal;
export const DropdownSub = DropdownMenuPrimitive.Sub;
export const DropdownSeparator = DropdownMenuPrimitive.Separator;

const dropdownContent = cva([
  "z-50 min-w-[160px] overflow-hidden rounded-md",
  "bg-engine-800 p-1 text-foreground shadow-lg",
  "data-[state=open]:animate-in data-[state=closed]:animate-out",
  "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
]);

export function DropdownContent({
  class: className,
  sideOffset = 8,
  align = "end",
  children,
  ...rest
}: {
  class?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  children?: ComponentChildren;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "align">) {
  return (
    <DropdownMenuPrimitive.Portal>
      <DropdownMenuPrimitive.Content
        sideOffset={sideOffset}
        align={align}
        class={cn(dropdownContent(), className)}
        {...rest}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

// `pointer-events-auto` is explicit because sparkle's normalize.css
// declares `* { pointer-events: none }` as a defensive base. Without
// re-asserting it the dropdown item's hover/click would silently fall
// through to the underlying page and the cursor wouldn't follow the
// `cursor-pointer` declaration (cursor tracks hit-testing).
const dropdownItem = cva([
  "flex cursor-pointer pointer-events-auto flex-row items-center gap-2 rounded px-2 py-1.5",
  "text-sm select-none outline-none",
  "hover:bg-foreground/10 focus:bg-foreground/10",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
]);

export function DropdownItem({
  class: className,
  children,
  ...rest
}: { class?: string; children?: ComponentChildren } & Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "class"
>) {
  return (
    <DropdownMenuPrimitive.Item class={cn(dropdownItem(), className)} {...rest}>
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownCheckboxItem({
  class: className,
  checked,
  onCheckedChange,
  children,
  ...rest
}: {
  class?: string;
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  children?: ComponentChildren;
} & Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "class" | "checked" | "onChange"
>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      class={cn(dropdownItem(), className)}
      {...rest}
    >
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
