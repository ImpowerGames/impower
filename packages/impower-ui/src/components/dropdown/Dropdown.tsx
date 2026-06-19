// A RESPONSIVE menu under impower-ui's roof — a faithful port of the old
// impower-app `DrawerMenu`: a small dropdown/popover on desktop, a bottom sheet
// on mobile (below the editor's 960px breakpoint). The same authoring API
// (Root/Trigger/Content/Item/CheckboxItem) renders the matching primitive:
// Radix DropdownMenu on desktop, Radix Dialog (styled as a bottom sheet) on
// mobile. `DropdownRoot` publishes the mode via context so the pieces agree.
//
// Transitions match impower-app's MUI defaults — desktop = `Grow`, mobile =
// `Drawer` slide-up + backdrop fade (see the keyframes in style.css).
import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import { type ComponentChildren, createContext, type JSX } from "preact";
import { useContext } from "preact/hooks";
import { useIsMobile } from "../../hooks/useIsMobile";
import { cn } from "../../utils/cn";
import Ripple from "../ripple/Ripple";

type Mode = "menu" | "sheet";
const ModeContext = createContext<Mode>("menu");
const useMode = (): Mode => useContext(ModeContext);

// Re-exports for the un-styled bits not used responsively in impower-dev — they
// stay desktop (DropdownMenu) primitives.
export const DropdownPortal = DropdownMenuPrimitive.Portal;
export const DropdownSub = DropdownMenuPrimitive.Sub;
export const DropdownSeparator = DropdownMenuPrimitive.Separator;

// Props common to both Radix roots (open / defaultOpen / onOpenChange / modal).
type RootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: ComponentChildren;
};

/**
 * Menu root. Renders a Radix DropdownMenu on desktop and a Radix Dialog (bottom
 * sheet) on mobile, publishing the active mode to its descendants. Open-state
 * props (`open`/`defaultOpen`/`onOpenChange`) are shared by both primitives.
 */
export function DropdownRoot({ children, ...rest }: RootProps) {
  const mobile = useIsMobile();
  if (mobile) {
    return (
      <ModeContext.Provider value="sheet">
        <DialogPrimitive.Root {...rest}>{children}</DialogPrimitive.Root>
      </ModeContext.Provider>
    );
  }
  return (
    <ModeContext.Provider value="menu">
      <DropdownMenuPrimitive.Root {...rest}>
        {children}
      </DropdownMenuPrimitive.Root>
    </ModeContext.Provider>
  );
}

export function DropdownTrigger(props: {
  asChild?: boolean;
  children?: ComponentChildren;
}) {
  const Trigger =
    useMode() === "sheet"
      ? DialogPrimitive.Trigger
      : DropdownMenuPrimitive.Trigger;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <Trigger {...(props as any)} />;
}

// Popup surface styling. `bg-popup` (a fixed dark neutral, ~rgb(18,18,18)) is
// the canonical "floating panel" surface — distinct from `engine-800` (inline
// surfaces). py-2 / px-0 matches the legacy `<s-box p="8 0">`; items provide
// their own horizontal padding.
const dropdownContent = cva([
  "z-50 min-w-[120px] overflow-hidden rounded-lg",
  "bg-popup py-2 px-0 text-foreground shadow-xl ring-1 ring-foreground/10",
  // MUI Grow: opacity + asymmetric scale from the trigger corner.
  "origin-[--radix-dropdown-menu-content-transform-origin]",
  "data-[state=open]:anim-menu-in data-[state=closed]:anim-menu-out",
]);

// Mobile bottom-sheet surfaces (MUI Drawer anchor="bottom"). Backdrop fade +
// a full-width panel pinned to the bottom with a rounded top (8px, matching the
// old `border-radius: 8px 8px 0 0`) that slides up.
const sheetOverlay = cva([
  "fixed inset-0 z-50 bg-black/40",
  "data-[state=open]:anim-overlay-in data-[state=closed]:anim-overlay-out",
]);
const sheetContent = cva([
  "fixed inset-x-0 bottom-0 z-50 max-h-[80vh] overflow-y-auto",
  "rounded-t-lg bg-popup py-2 text-foreground shadow-2xl",
  "data-[state=open]:anim-sheet-in data-[state=closed]:anim-sheet-out",
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
  if (useMode() === "sheet") {
    return (
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay class={sheetOverlay()} />
        <DialogPrimitive.Content
          class={cn(sheetContent(), className)}
          aria-label="Menu"
          aria-describedby={undefined}
          // Don't yank focus onto the first item on touch — the sheet just
          // appears; the user taps. (Escape / backdrop still dismiss.)
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title class="sr-only">Menu</DialogPrimitive.Title>
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    );
  }
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

// `pointer-events-auto` is explicit because sparkle's normalize.css declares
// `* { pointer-events: none }` as a defensive base. Item geometry matches the
// legacy `<s-button variant="option">`: 40px tall, 20px horizontal padding,
// 14px label, 70% white foreground. No outer corner radius (the popup is the
// rounded surface).
const dropdownItem = cva([
  "relative overflow-hidden",
  "flex h-10 w-full cursor-pointer pointer-events-auto flex-row items-center gap-2 px-5",
  "text-sm text-foreground/70 select-none outline-none text-left",
  "hover:bg-foreground/5 active:bg-foreground/[0.12]",
  "focus:bg-foreground/5",
  "disabled:pointer-events-none disabled:opacity-50",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
]);

export function DropdownItem({
  class: className,
  children,
  disabled,
  onSelect,
  ...rest
}: {
  class?: string;
  children?: ComponentChildren;
  disabled?: boolean;
  // Radix's onSelect (fires on item activation). Declared explicitly because
  // preact's DOM `onSelect` (text-selection) has an incompatible signature.
  onSelect?: (event: Event) => void;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "onSelect">) {
  if (useMode() === "sheet") {
    // In the sheet, items are plain buttons. `Dialog.Close` dismisses on tap
    // (matching a menu item closing the menu); the onSelect runs alongside.
    return (
      <DialogPrimitive.Close asChild>
        <button
          type="button"
          disabled={disabled}
          class={cn(dropdownItem(), className)}
          onClick={() => onSelect?.(new Event("select"))}
        >
          {children}
          <Ripple />
        </button>
      </DialogPrimitive.Close>
    );
  }
  return (
    <DropdownMenuPrimitive.Item
      class={cn(dropdownItem(), className)}
      disabled={disabled}
      onSelect={onSelect}
      {...rest}
    >
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
  if (useMode() === "sheet") {
    // Toggle in place — a checkbox shouldn't dismiss the sheet (you may flip
    // several), so it is NOT wrapped in Dialog.Close.
    return (
      <button
        type="button"
        role="menuitemcheckbox"
        aria-checked={checked}
        class={cn(dropdownItem(), className)}
        onClick={() => onCheckedChange?.(!checked)}
      >
        {children}
        <Ripple />
      </button>
    );
  }
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
