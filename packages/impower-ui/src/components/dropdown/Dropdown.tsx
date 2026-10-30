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
    const child = (Array.isArray(children) ? children[0] : children) as
      VNode<{ onClick?: (e: MouseEvent) => void }> | undefined;
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

const dropdownContent = cva([
  "z-50 min-w-[120px] overflow-hidden rounded-lg",
  "bg-popup py-2 px-0 text-foreground shadow-xl ring-1 ring-foreground/10",
  "origin-[--radix-dropdown-menu-content-transform-origin]",
  "data-[state=open]:anim-menu-in data-[state=closed]:anim-menu-out",
]);

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
  side?: "top" | "right" | "bottom" | "left";
  onCloseAutoFocus?: (event: Event) => void;
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
  // workaround(preact): preact's DOM `onSelect` (text selection) typing conflicts with Radix's item onSelect, so the prop is redeclared
  onSelect?: (event: Event) => void;
} & Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "onSelect">) {
  const ctx = useMenuCtx();
  if (ctx.mode === "sheet") {
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
