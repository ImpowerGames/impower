import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cva, type VariantProps } from "class-variance-authority";
import {
  cloneElement,
  type ComponentChildren,
  createContext,
  type JSX,
  type Ref,
  type RefObject,
  type VNode,
} from "preact";
import { flushSync } from "preact/compat";
import {
  type MutableRef,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "preact/hooks";
import { useForwardedRef } from "../../hooks/useForwardedRef";
import { useLayout } from "../../hooks/useLayout";
import { cn } from "../../utils/cn";
import "../../utils/uniqueIds";
import { registerFocusReturn } from "../../utils/focusReturn";
import { KEEP_CLEAR_MARGIN, type KeepClear, useClearLine } from "../../utils/keepClear";
import { portalContainer } from "../../utils/portalContainer";
import { DialogTitle, Sheet } from "../dialog/Dialog";
import { CheckIcon } from "../icon/icons.generated";

type Mode = "menu" | "sheet";
type MenuCtx = {
  mode: Mode;
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: RefObject<HTMLElement>;
  returnsFocus: MutableRef<boolean>;
  handingOff: boolean;
  handOff: () => void;
};
const ModeContext = createContext<MenuCtx>({
  mode: "menu",
  open: false,
  setOpen: () => {},
  trigger: { current: null },
  returnsFocus: { current: true },
  handingOff: false,
  handOff: () => {},
});
const useMenuCtx = () => useContext(ModeContext);

export function DropdownSeparator({ class: className }: { class?: string }) {
  return (
    <DropdownMenuPrimitive.Separator
      class={cn("-mx-1.5 my-1.5 h-px bg-edge", className)}
    />
  );
}

export const dropdownLabelVariants = cva("px-3", {
  variants: {
    variant: {
      default: "pt-2 pb-1.5 text-ink",
      heading:
        "pt-2 pb-1 text-[11px] font-semibold uppercase tracking-[0.04em] text-muted",
    },
  },
  defaultVariants: { variant: "default" },
});

export type DropdownLabelVariant = NonNullable<
  VariantProps<typeof dropdownLabelVariants>["variant"]
>;

export function DropdownLabel({
  class: className,
  variant,
  children,
}: {
  class?: string;
  variant?: DropdownLabelVariant;
  children?: ComponentChildren;
}) {
  const ctx = useMenuCtx();
  const classes = cn(dropdownLabelVariants({ variant }), className);
  if (ctx.mode === "sheet") {
    return <div class={classes}>{children}</div>;
  }
  return (
    <DropdownMenuPrimitive.Label class={classes}>
      {children}
    </DropdownMenuPrimitive.Label>
  );
}

type RootProps = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  modal?: boolean;
  sheet?: boolean;
  children?: ComponentChildren;
};

export function DropdownRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal,
  sheet = true,
  children,
}: RootProps) {
  const phone = useLayout() === "phone";
  const mobile = sheet && phone;
  const trigger = useRef<HTMLElement>(null);
  const returnsFocus = useRef(true);
  const [handingOff, setHandingOff] = useState(false);
  const [internal, setInternal] = useState(defaultOpen);
  const controlled = openProp !== undefined;
  const open = controlled ? !!openProp : internal;
  const opening = (next: boolean) => {
    if (next) {
      returnsFocus.current = true;
      setHandingOff(false);
    }
  };
  const handOff = useCallback(() => {
    returnsFocus.current = false;
    setHandingOff(true);
  }, []);
  const setOpen = useCallback(
    (next: boolean) => {
      opening(next);
      if (!controlled) {
        setInternal(next);
      }
      onOpenChange?.(next);
    },
    [controlled, onOpenChange],
  );
  const shared = { open, setOpen, trigger, returnsFocus, handingOff, handOff };

  if (mobile) {
    return (
      <ModeContext.Provider value={{ mode: "sheet", ...shared }}>
        {children}
      </ModeContext.Provider>
    );
  }
  return (
    <ModeContext.Provider value={{ mode: "menu", ...shared }}>
      <DropdownMenuPrimitive.Root
        open={openProp}
        defaultOpen={defaultOpen}
        onOpenChange={setOpen}
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
  const child = (Array.isArray(children) ? children[0] : children) as
    | (VNode<{ onClick?: (e: MouseEvent) => void }> & {
        ref?: Ref<HTMLElement>;
      })
    | undefined;
  const setTriggerRef = useForwardedRef(
    child && typeof child === "object" ? child.ref : undefined,
    (element: HTMLElement | null) => {
      ctx.trigger.current = element;
    },
  );
  if (ctx.mode === "sheet") {
    if (child && typeof child === "object" && "props" in child) {
      return cloneElement(child, {
        onClick: (e: MouseEvent) => {
          child.props.onClick?.(e);
          ctx.setOpen(true);
        },
        ref: setTriggerRef,
      });
    }
    return <>{children}</>;
  }
  return (
    <DropdownMenuPrimitive.Trigger asChild={asChild} ref={ctx.trigger}>
      {children}
    </DropdownMenuPrimitive.Trigger>
  );
}

export const dropdownContentVariants = cva(
  [
    "z-50 min-w-[120px] overflow-y-auto overscroll-contain rounded-card",
    "bg-popup p-1.5 text-ink shadow-float ring-1 ring-edge",
    "origin-[--radix-dropdown-menu-content-transform-origin]",
    "motion-safe:data-[state=open]:anim-menu-in motion-safe:data-[state=closed]:anim-menu-out",
  ],
  {
    variants: {
      fit: {
        free: "",
        room: "max-h-[var(--radix-dropdown-menu-content-available-height)]",
      },
    },
    defaultVariants: { fit: "free" },
  },
);

export type DropdownContentFit = NonNullable<
  VariantProps<typeof dropdownContentVariants>["fit"]
>;

const EDGE_GAP = 12;
const ROW = 44;

const leastHeight = (menu: HTMLElement | null) => {
  if (!menu) {
    return ROW + 12;
  }
  const style = getComputedStyle(menu);
  const chrome = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce(
    (sum, side) => sum + (parseFloat(style[side as keyof CSSStyleDeclaration] as string) || 0),
    0,
  );
  const row = menu.querySelector('[role^="menuitem"]')?.getBoundingClientRect().height || ROW;
  return chrome + row;
};

const clearOf = (
  line: number,
  trigger: HTMLElement | null,
  menu: HTMLElement | null,
  sideOffset: number,
) => {
  const top = Math.max(EDGE_GAP, line);
  const placed = (bottom: number, offset: number) => ({
    padding: { top, bottom, left: EDGE_GAP, right: EDGE_GAP },
    offset,
  });
  if (!trigger) {
    return placed(EDGE_GAP, sideOffset);
  }
  const least = leastHeight(menu);
  const at = trigger.getBoundingClientRect();
  const under = window.innerHeight - at.bottom - least;
  if (under - sideOffset >= EDGE_GAP || at.top - sideOffset - top >= least) {
    return placed(EDGE_GAP, sideOffset);
  }
  if (under - sideOffset >= KEEP_CLEAR_MARGIN) {
    return placed(under - sideOffset, sideOffset);
  }
  return placed(KEEP_CLEAR_MARGIN, Math.min(sideOffset, Math.max(KEEP_CLEAR_MARGIN, under - KEEP_CLEAR_MARGIN)));
};

type MenuAttributes = Omit<JSX.HTMLAttributes<HTMLDivElement>, "class" | "align">;

function SheetMenu({
  open,
  setOpen,
  trigger,
  returnsFocus,
  owner,
  keepClear,
  onCloseAutoFocus,
  class: className,
  children,
  ...rest
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: RefObject<HTMLElement>;
  returnsFocus: MutableRef<boolean>;
  owner: (element: HTMLElement | null) => void;
  keepClear?: KeepClear;
  onCloseAutoFocus?: (event: Event) => void;
  class?: string;
  children?: ComponentChildren;
} & MenuAttributes) {
  const menu = useRef<HTMLElement | null>(null);
  const chosen = useMemo(
    () => ({
      get current() {
        return menu.current?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]') ?? null;
      },
    }),
    [],
  );
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      flush
      keepClear={keepClear}
      initialFocus={chosen}
      onCloseAutoFocus={onCloseAutoFocus}
      returnFocus={() =>
        returnsFocus.current
          ? trigger.current
          : (document.activeElement as HTMLElement | null)
      }
    >
      <DialogTitle class="sr-only">Menu</DialogTitle>
      <div
        {...rest}
        ref={(element: HTMLDivElement | null) => {
          menu.current = element;
          owner(element);
        }}
        role="menu"
        class={cn("overflow-y-auto overscroll-contain p-1.5", className)}
      >
        {children}
      </div>
    </Sheet>
  );
}

export function DropdownContent({
  class: className,
  sideOffset = 8,
  align = "end",
  side,
  keepClear,
  onCloseAutoFocus,
  children,
  ...rest
}: {
  class?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  keepClear?: KeepClear;
  onCloseAutoFocus?: (event: Event) => void;
  children?: ComponentChildren;
} & MenuAttributes) {
  const ctx = useMenuCtx();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const menuRef = useMemo(() => ({ current: menu }), [menu]);
  const owner = (element: HTMLElement | null) => {
    if (element) {
      registerFocusReturn(element, () => ctx.trigger.current);
      if (keepClear && element !== menu) {
        setMenu(element);
      }
    }
  };
  const clear = useClearLine(
    keepClear,
    ctx.mode === "menu" && ctx.open,
    (line) => clearOf(line, ctx.trigger.current, menu, sideOffset),
    menuRef,
  );
  if (ctx.handingOff) {
    return null;
  }
  if (ctx.mode === "sheet") {
    return (
      <SheetMenu
        open={ctx.open}
        setOpen={ctx.setOpen}
        trigger={ctx.trigger}
        returnsFocus={ctx.returnsFocus}
        owner={owner}
        keepClear={keepClear}
        onCloseAutoFocus={onCloseAutoFocus}
        class={className}
        {...rest}
      >
        {children}
      </SheetMenu>
    );
  }
  return (
    <DropdownMenuPrimitive.Portal container={portalContainer()}>
      <DropdownMenuPrimitive.Content
        ref={owner}
        sideOffset={clear?.offset ?? sideOffset}
        align={align}
        side={side}
        {...(clear ? { collisionPadding: clear.padding } : {})}
        class={cn(
          dropdownContentVariants({ fit: keepClear ? "room" : "free" }),
          className,
        )}
        onCloseAutoFocus={(event: Event) => {
          if (!ctx.returnsFocus.current) {
            event.preventDefault();
          }
          onCloseAutoFocus?.(event);
        }}
        {...rest}
      >
        {children}
      </DropdownMenuPrimitive.Content>
    </DropdownMenuPrimitive.Portal>
  );
}

const dropdownItem = cva([
  "relative control-overlay rounded-control",
  "flex min-h-11 w-full cursor-pointer flex-row items-center gap-2 px-3",
  "text-sm text-ink select-none text-left [&_svg]:size-[18px]",
  "disabled:pointer-events-none disabled:opacity-40",
  "data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
]);

type ItemAttributes = Omit<
  JSX.HTMLAttributes<HTMLElement>,
  "class" | "ref" | "value" | "checked" | "disabled" | "onChange" | "onSelect"
>;

type SharedItemProps = ItemAttributes & {
  class: string;
  disabled?: boolean;
};

function SheetRow({
  role,
  checked,
  returnFocus = true,
  onSelect,
  onClick,
  children,
  ...shared
}: SharedItemProps & {
  role: "menuitem" | "menuitemcheckbox" | "menuitemradio";
  checked?: boolean;
  returnFocus?: boolean;
  onSelect: (event: Event) => void;
  children?: ComponentChildren;
}) {
  const ctx = useMenuCtx();
  return (
    <button
      {...shared}
      type="button"
      role={role}
      aria-checked={checked}
      data-state={checked === undefined ? undefined : checked ? "checked" : "unchecked"}
      onClick={(event) => {
        onClick?.(event);
        if (event.defaultPrevented) {
          return;
        }
        const select = new Event("select", { cancelable: true });
        if (!returnFocus) {
          flushSync(ctx.handOff);
        }
        onSelect(select);
        if (!select.defaultPrevented) {
          ctx.setOpen(false);
        }
      }}
    >
      {children}
    </button>
  );
}

export function DropdownItem({
  class: className,
  children,
  disabled,
  returnFocus = true,
  onSelect,
  ...rest
}: {
  class?: string;
  children?: ComponentChildren;
  disabled?: boolean;
  returnFocus?: boolean;
  // workaround(preact): preact's DOM `onSelect` (text selection) typing conflicts with Radix's item onSelect, so the prop is redeclared (seen with preact 10.29.2)
  onSelect?: (event: Event) => void;
} & ItemAttributes) {
  const ctx = useMenuCtx();
  const shared: SharedItemProps = { class: cn(dropdownItem(), className), disabled, ...rest };
  if (ctx.mode === "sheet") {
    return (
      <SheetRow {...shared} role="menuitem" returnFocus={returnFocus} onSelect={(event) => onSelect?.(event)}>
        {children}
      </SheetRow>
    );
  }
  return (
    <DropdownMenuPrimitive.Item
      {...shared}
      onSelect={(event: Event) => {
        if (!returnFocus) {
          ctx.handOff();
        }
        onSelect?.(event);
      }}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function DropdownCheckboxItem({
  class: className,
  checked,
  disabled,
  onCheckedChange,
  onSelect,
  children,
  ...rest
}: {
  class?: string;
  checked?: boolean;
  disabled?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  onSelect?: (event: Event) => void;
  children?: ComponentChildren;
} & ItemAttributes) {
  const ctx = useMenuCtx();
  const shared: SharedItemProps = { class: cn(dropdownItem(), className), disabled, ...rest };
  if (ctx.mode === "sheet") {
    return (
      <SheetRow
        {...shared}
        role="menuitemcheckbox"
        checked={!!checked}
        onSelect={(event) => {
          onSelect?.(event);
          onCheckedChange?.(!checked);
        }}
      >
        {children}
      </SheetRow>
    );
  }
  return (
    <DropdownMenuPrimitive.CheckboxItem
      {...shared}
      checked={checked}
      onCheckedChange={onCheckedChange}
      onSelect={onSelect}
    >
      {children}
    </DropdownMenuPrimitive.CheckboxItem>
  );
}

type RadioCtx = {
  value?: string;
  onValueChange?: (value: string) => void;
};
const RadioContext = createContext<RadioCtx>({});

export function DropdownRadioGroup({
  value,
  onValueChange,
  label,
  class: className,
  children,
}: {
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  class?: string;
  children?: ComponentChildren;
}) {
  const ctx = useMenuCtx();
  return (
    <RadioContext.Provider value={{ value, onValueChange }}>
      {ctx.mode === "sheet" ? (
        <div role="group" aria-label={label} class={className}>
          {children}
        </div>
      ) : (
        <DropdownMenuPrimitive.RadioGroup
          value={value}
          onValueChange={onValueChange}
          aria-label={label}
          class={className}
        >
          {children}
        </DropdownMenuPrimitive.RadioGroup>
      )}
    </RadioContext.Provider>
  );
}

export const dropdownRadioItemVariants = cva(
  [
    "group",
    "[&>[data-radio-indicator]]:size-4 [&>[data-radio-indicator]]:shrink-0",
    "[&>[data-radio-indicator]]:text-accent [&>[data-radio-indicator]]:invisible",
    "data-[state=checked]:[&>[data-radio-indicator]]:visible",
  ],
  {
    variants: {
      indicator: {
        start: "",
        end: "[&>[data-radio-indicator]]:order-last [&>[data-radio-indicator]]:ml-auto",
      },
      size: {
        default: "data-[state=checked]:font-semibold",
        small: "text-[13px] font-normal",
      },
    },
    defaultVariants: { indicator: "start", size: "default" },
  },
);

export function DropdownItemText({
  hint,
  children,
}: {
  hint?: ComponentChildren;
  children?: ComponentChildren;
}) {
  if (hint === undefined) {
    return <>{children}</>;
  }
  return (
    <span class="flex min-w-0 flex-col gap-0.5 py-2.5" data-dropdown-item-text>
      <span>{children}</span>
      <small class="max-w-[200px] text-[11px]/[1.4] font-normal whitespace-normal text-muted">{hint}</small>
    </span>
  );
}

export type DropdownRadioItemIndicator = NonNullable<
  VariantProps<typeof dropdownRadioItemVariants>["indicator"]
>;

export type DropdownRadioItemSize = NonNullable<
  VariantProps<typeof dropdownRadioItemVariants>["size"]
>;

function RadioIndicator() {
  return <CheckIcon data-radio-indicator="" />;
}

export function DropdownRadioItem({
  value,
  indicator,
  size,
  disabled,
  class: className,
  children,
  ...rest
}: {
  value: string;
  indicator?: DropdownRadioItemIndicator;
  size?: DropdownRadioItemSize;
  disabled?: boolean;
  class?: string;
  children?: ComponentChildren;
} & ItemAttributes) {
  const ctx = useMenuCtx();
  const radio = useContext(RadioContext);
  const shared: SharedItemProps = {
    class: cn(dropdownItem(), dropdownRadioItemVariants({ indicator, size }), className),
    disabled,
    ...rest,
  };
  if (ctx.mode === "sheet") {
    return (
      <SheetRow
        {...shared}
        role="menuitemradio"
        checked={radio.value === value}
        onSelect={() => radio.onValueChange?.(value)}
      >
        <RadioIndicator />
        {children}
      </SheetRow>
    );
  }
  return (
    <DropdownMenuPrimitive.RadioItem {...shared} value={value}>
      <RadioIndicator />
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
