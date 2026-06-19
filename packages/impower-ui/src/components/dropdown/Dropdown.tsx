// A RESPONSIVE menu under impower-ui's roof — a faithful port of the old
// impower-app `DrawerMenu`: a small dropdown/popover on desktop, a bottom sheet
// on mobile (below the editor's 960px breakpoint). The same authoring API
// (Root/Trigger/Content/Item/CheckboxItem) renders the matching presentation.
//
//  - DESKTOP keeps Radix DropdownMenu (popover + keyboard nav). Its enter/exit
//    is a MUI `Grow` keyframe on Radix's `data-state` (style.css) — Radix
//    DropdownMenu's Presence drives that reliably.
//  - MOBILE is a fully custom bottom sheet (a portal + backdrop + panel driven
//    by `useMountTransition`, the same pattern as the file-manager dialogs).
//    Radix Dialog's Presence races on exit under preact, so we own the mount
//    ourselves — giving a reliable slide-up AND slide-down (MUI `Drawer`).
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva } from "class-variance-authority";
import {
  cloneElement,
  type ComponentChildren,
  createContext,
  type JSX,
  type VNode,
} from "preact";
import { createPortal } from "preact/compat";
import { useCallback, useContext, useEffect, useState } from "preact/hooks";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useMountTransition } from "../../hooks/useMountTransition";
import { cn } from "../../utils/cn";
import Ripple from "../ripple/Ripple";

// Keep the sheet mounted this long after close so its slide-down finishes.
const SHEET_MS = 240;

type Mode = "menu" | "sheet";
type MenuCtx = {
  mode: Mode;
  open: boolean;
  setOpen: (open: boolean) => void;
};
const ModeContext = createContext<MenuCtx>({
  mode: "menu",
  open: false,
  setOpen: () => {},
});
const useMenuCtx = () => useContext(ModeContext);

// Re-exports for the un-styled bits not used responsively in impower-dev — they
// stay desktop (DropdownMenu) primitives.
export const DropdownPortal = DropdownMenuPrimitive.Portal;
export const DropdownSub = DropdownMenuPrimitive.Sub;
export const DropdownSeparator = DropdownMenuPrimitive.Separator;

type RootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  children?: ComponentChildren;
};

/**
 * Menu root. On desktop it's a Radix DropdownMenu (Radix owns the open state);
 * on mobile it owns the open state itself (the custom sheet is controlled) and
 * publishes mode + open + setOpen to its descendants.
 */
export function DropdownRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal,
  children,
}: RootProps) {
  const mobile = useIsMobile();
  const [internal, setInternal] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : internal;
  const setOpen = useCallback(
    (next: boolean) => {
      if (!controlled) {
        setInternal(next);
      }
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );

  if (mobile) {
    return (
      <ModeContext.Provider value={{ mode: "sheet", open, setOpen }}>
        {children}
      </ModeContext.Provider>
    );
  }
  return (
    <ModeContext.Provider value={{ mode: "menu", open, setOpen }}>
      <DropdownMenuPrimitive.Root
        open={openProp}
        defaultOpen={defaultOpen}
        onOpenChange={onOpenChange}
        modal={modal}
      >
        {children}
      </DropdownMenuPrimitive.Root>
    </ModeContext.Provider>
  );
}

export function DropdownTrigger({
  asChild,
  children,
}: {
  asChild?: boolean;
  children?: ComponentChildren;
}) {
  const ctx = useMenuCtx();
  if (ctx.mode === "sheet") {
    // No Radix root on mobile — wire the (asChild) trigger straight to setOpen,
    // preserving the child's own onClick (e.g. a row's stopPropagation).
    const child = (Array.isArray(children) ? children[0] : children) as
      | VNode<{ onClick?: (e: MouseEvent) => void }>
      | undefined;
    if (child && typeof child === "object" && "props" in child) {
      return cloneElement(child, {
        onClick: (e: MouseEvent) => {
          child.props.onClick?.(e);
          ctx.setOpen(true);
        },
      });
    }
    return <>{children}</>;
  }
  return (
    <DropdownMenuPrimitive.Trigger asChild={asChild}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  );
}

// Popup surface styling. `bg-popup` (a fixed dark neutral, ~rgb(18,18,18)) is
// the canonical "floating panel" surface — distinct from `engine-800` (inline
// surfaces). py-2 / px-0 matches the legacy `<s-box p="8 0">`; items provide
// their own horizontal padding.
const dropdownContent = cva([
  "z-50 min-w-[120px] overflow-hidden rounded-lg",
  "bg-popup py-2 px-0 text-foreground shadow-xl ring-1 ring-foreground/10",
  // MUI Grow keyframe on Radix's data-state (see style.css).
  "origin-[--radix-dropdown-menu-content-transform-origin]",
  "data-[state=open]:anim-menu-in data-[state=closed]:anim-menu-out",
]);

/**
 * Mobile bottom sheet — a portal with a dim backdrop (fade) and a full-width
 * panel pinned to the bottom (8px rounded top, matching the old Drawer) that
 * slides up. `useMountTransition` owns the mount so the slide-down plays on
 * close. Backdrop click + Escape dismiss; body scroll is locked while open.
 */
function Sheet({
  open,
  setOpen,
  class: className,
  children,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  class?: string;
  children?: ComponentChildren;
}) {
  // Own the mount so the slide-DOWN plays before unmount.
  const { mounted } = useMountTransition(open, SHEET_MS);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, setOpen]);

  if (!mounted || typeof document === "undefined") {
    return null;
  }
  // Keyframe animations keyed off `open` (a stable prop): the class swaps from
  // the "up"/"in" animation to the "down"/"out" one when closing, which restarts
  // the animation. `forwards` on the exits holds the closed frame until
  // useMountTransition unmounts.
  return createPortal(
    <div class="fixed inset-0 z-50">
      <div
        class={cn(
          "absolute inset-0 bg-black/40",
          open
            ? "animate-[menu-fade-in_200ms_ease-out]"
            : "animate-[menu-fade-out_200ms_ease-out_forwards]",
        )}
        onClick={() => setOpen(false)}
        role="presentation"
      />
      <div
        role="menu"
        class={cn(
          "absolute inset-x-0 bottom-0 max-h-[80vh] overflow-y-auto",
          "rounded-t-lg bg-popup py-2 text-foreground shadow-2xl will-change-transform",
          open
            ? "animate-[menu-sheet-up_225ms_cubic-bezier(0,0,0.2,1)]"
            : "animate-[menu-sheet-down_195ms_cubic-bezier(0.4,0,0.6,1)_forwards]",
          className,
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

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
  const ctx = useMenuCtx();
  if (ctx.mode === "sheet") {
    return (
      <Sheet open={ctx.open} setOpen={ctx.setOpen} class={className}>
        {children}
      </Sheet>
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
  const ctx = useMenuCtx();
  if (ctx.mode === "sheet") {
    // In the sheet, items are plain buttons that run onSelect and dismiss.
    return (
      <button
        type="button"
        role="menuitem"
        disabled={disabled}
        class={cn(dropdownItem(), className)}
        onClick={() => {
          onSelect?.(new Event("select"));
          ctx.setOpen(false);
        }}
      >
        {children}
        <Ripple />
      </button>
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
  const ctx = useMenuCtx();
  if (ctx.mode === "sheet") {
    // Toggle in place — a checkbox shouldn't dismiss the sheet (you may flip
    // several), so it does NOT call setOpen.
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
