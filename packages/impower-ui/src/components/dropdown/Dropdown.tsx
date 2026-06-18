// Thin re-export of Radix DropdownMenu pieces under impower-ui's roof so
// consumer packages (impower-dev) don't need their own copy of
// @radix-ui/react-dropdown-menu. Pre-skinned `Content` and `Item` variants
// match the rest of impower-ui's surface (engine-800 surface, hover state).
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { cn } from "../../utils/cn";
import Ripple from "../ripple/Ripple";

// Re-exports — use these for the un-styled bits (Root, Trigger, Portal,
// Sub, Separator, etc.). Wrappers further down add impower-ui styling
// to the visible bits (Content, Item, CheckboxItem).
export const DropdownRoot = DropdownMenuPrimitive.Root;
export const DropdownTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownPortal = DropdownMenuPrimitive.Portal;
export const DropdownSub = DropdownMenuPrimitive.Sub;
export const DropdownSeparator = DropdownMenuPrimitive.Separator;

// Popup surface styling. `bg-popup` (a fixed dark neutral, ~rgb(18,18,18))
// is the canonical "floating panel" surface in the design system —
// distinct from `engine-800` which is for inline surfaces. py-2 / px-0
// matches the legacy `<s-box p="8 0">`; items provide their own
// horizontal padding.
const dropdownContent = cva([
  "z-50 min-w-[120px] overflow-hidden rounded-lg",
  "bg-popup py-2 px-0 text-foreground",
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
// Item geometry matches the legacy `<s-button variant="option">`:
// 40px tall, 20px horizontal padding, 14px label, 70% white foreground.
// No outer corner radius (the popup itself is the rounded surface).
const dropdownItem = cva([
  // relative + overflow-hidden so the inner <Ripple /> wave is clipped
  // to the item's bounds.
  "relative overflow-hidden",
  "flex h-10 cursor-pointer pointer-events-auto flex-row items-center gap-2 px-5",
  "text-sm text-foreground/70 select-none outline-none",
  // Static hover/active layer (5% / 12% currentColor). The <Ripple />
  // adds the expanding radial wave on press.
  "hover:bg-foreground/5 active:bg-foreground/[0.12]",
  "focus:bg-foreground/5",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
]);

export function DropdownItem({
  class: className,
  children,
  ...rest
}: {
  class?: string;
  children?: ComponentChildren;
  // Radix's onSelect (fires on item activation). Declared explicitly because
  // preact's DOM `onSelect` (text-selection) has an incompatible signature;
  // it's omitted from the spread below so radix's wins.
  onSelect?: (event: Event) => void;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "onSelect">) {
  return (
    <DropdownMenuPrimitive.Item class={cn(dropdownItem(), className)} {...rest}>
      {children}
      <Ripple />
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
  onSelect?: (event: Event) => void;
  children?: ComponentChildren;
} & Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "class" | "checked" | "onChange" | "onSelect"
>) {
  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={checked}
      onCheckedChange={onCheckedChange}
      class={cn(dropdownItem(), className)}
      {...rest}
    >
      {children}
      <Ripple />
    </DropdownMenuPrimitive.CheckboxItem>
  );
}
