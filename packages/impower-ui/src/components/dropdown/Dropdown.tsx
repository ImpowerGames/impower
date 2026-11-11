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
  useRef,
  useState,
} from "preact/hooks";
import { useForwardedRef } from "../../hooks/useForwardedRef";
import { useLayout } from "../../hooks/useLayout";
import { cn } from "../../utils/cn";
import { registerFocusReturn } from "../../utils/focusReturn";
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
  children?: ComponentChildren;
};

export function DropdownRoot({
  open: openProp,
  defaultOpen = false,
  onOpenChange,
  modal,
  children,
}: RootProps) {
  const mobile = useLayout() === "phone";
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
        onOpenChange={(next: boolean) => {
          opening(next);
          onOpenChange?.(next);
        }}
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

const dropdownContent = cva([
  "z-50 min-w-[120px] overflow-y-auto rounded-card",
  "bg-popup p-1.5 text-ink shadow-float ring-1 ring-edge",
  "origin-[--radix-dropdown-menu-content-transform-origin]",
  "motion-safe:data-[state=open]:anim-menu-in motion-safe:data-[state=closed]:anim-menu-out",
]);

function SheetMenu({
  open,
  setOpen,
  trigger,
  returnsFocus,
  owner,
  class: className,
  children,
}: {
  open: boolean;
  setOpen: (open: boolean) => void;
  trigger: RefObject<HTMLElement>;
  returnsFocus: MutableRef<boolean>;
  owner: (element: HTMLElement | null) => void;
  class?: string;
  children?: ComponentChildren;
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={setOpen}
      flush
      returnFocus={() =>
        returnsFocus.current
          ? trigger.current
          : (document.activeElement as HTMLElement | null)
      }
    >
      <DialogTitle class="sr-only">Menu</DialogTitle>
      <div
        ref={owner}
        role="menu"
        class={cn("overflow-y-auto p-1.5", className)}
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
  onCloseAutoFocus,
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
  const owner = (element: HTMLElement | null) => {
    if (element) {
      registerFocusReturn(element, () => ctx.trigger.current);
    }
  };
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
        class={className}
      >
        {children}
      </SheetMenu>
    );
  }
  return (
    <DropdownMenuPrimitive.Portal container={portalContainer()}>
      <DropdownMenuPrimitive.Content
        ref={owner}
        sideOffset={sideOffset}
        align={align}
        class={cn(dropdownContent(), className)}
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
          if (!returnFocus) {
            flushSync(ctx.handOff);
          }
          onSelect?.(new Event("select"));
          ctx.setOpen(false);
        }}
      >
        {children}
      </button>
    );
  }
  return (
    <DropdownMenuPrimitive.Item
      class={cn(dropdownItem(), className)}
      disabled={disabled}
      onSelect={(event: Event) => {
        if (!returnFocus) {
          ctx.handOff();
        }
        onSelect?.(event);
      }}
      {...rest}
    >
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
    "group data-[state=checked]:font-semibold",
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
    },
    defaultVariants: { indicator: "start" },
  },
);

export type DropdownRadioItemIndicator = NonNullable<
  VariantProps<typeof dropdownRadioItemVariants>["indicator"]
>;

function RadioIndicator() {
  return <CheckIcon data-radio-indicator="" />;
}

export function DropdownRadioItem({
  value,
  indicator,
  disabled,
  class: className,
  children,
  ...rest
}: {
  value: string;
  indicator?: DropdownRadioItemIndicator;
  disabled?: boolean;
  class?: string;
  children?: ComponentChildren;
} & Omit<
  JSX.HTMLAttributes<HTMLDivElement>,
  "class" | "value" | "disabled" | "onChange" | "onSelect"
>) {
  const ctx = useMenuCtx();
  const radio = useContext(RadioContext);
  const classes = cn(
    dropdownItem(),
    dropdownRadioItemVariants({ indicator }),
    className,
  );
  if (ctx.mode === "sheet") {
    const checked = radio.value === value;
    return (
      <button
        type="button"
        role="menuitemradio"
        aria-checked={checked}
        data-state={checked ? "checked" : "unchecked"}
        disabled={disabled}
        class={classes}
        onClick={() => {
          radio.onValueChange?.(value);
          ctx.setOpen(false);
        }}
      >
        <RadioIndicator />
        {children}
      </button>
    );
  }
  return (
    <DropdownMenuPrimitive.RadioItem
      value={value}
      disabled={disabled}
      class={classes}
      {...rest}
    >
      <RadioIndicator />
      {children}
    </DropdownMenuPrimitive.RadioItem>
  );
}
