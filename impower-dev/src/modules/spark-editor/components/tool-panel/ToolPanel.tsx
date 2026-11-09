import {
  BackIcon,
  Button,
  CloseIcon,
  DialogTitle,
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
  Sheet,
} from "@impower/impower-ui/components";
import { useLayout } from "@impower/impower-ui/layout";
import {
  cloneElement,
  createContext,
  isValidElement,
  type ComponentChildren,
  type VNode,
} from "preact";
import { useContext, useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { cn } from "../../../../../../packages/impower-ui/src/utils/cn";
import workspace from "../../workspace/WorkspaceStore";

export type ToolPanelCloseReason = "close" | "escape" | "dismiss";

export type ToolPanelPresentation = "popover" | "sheet" | "keyboard";

type PanelContext = {
  sheet: boolean;
  keyboard: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: (reason: ToolPanelCloseReason) => void;
};

const Context = createContext<PanelContext>({
  sheet: false,
  keyboard: false,
  open: false,
  onOpen: () => {},
  onClose: () => {},
});

export type ToolPanelRootProps = {
  presentation?: ToolPanelPresentation;
  open: boolean;
  onOpen: () => void;
  onClose: (reason: ToolPanelCloseReason) => void;
  children?: ComponentChildren;
};

export function ToolPanelRoot({
  presentation,
  open,
  onOpen,
  onClose,
  children,
}: ToolPanelRootProps) {
  const layout = useLayout();
  const resolved = presentation ?? (layout === "phone" ? "sheet" : "popover");
  const sheet = resolved === "sheet";
  const keyboard = resolved === "keyboard";
  const value = { sheet, keyboard, open, onOpen, onClose };
  if (sheet || keyboard) {
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }
  return (
    <Context.Provider value={value}>
      <Popover
        open={open}
        onOpenChange={(next) => (next ? onOpen() : onClose("dismiss"))}
        modal={false}
      >
        {children}
      </Popover>
    </Context.Provider>
  );
}

export function ToolPanelAnchor({ children }: { children?: ComponentChildren }) {
  const { sheet, keyboard } = useContext(Context);
  if (sheet || keyboard) return <>{children}</>;
  return <PopoverAnchor asChild>{children}</PopoverAnchor>;
}

export function ToolPanelTrigger({ children }: { children?: ComponentChildren }) {
  const { sheet, keyboard, open, onOpen, onClose } = useContext(Context);
  if (!sheet && !keyboard) {
    return <PopoverTrigger asChild>{children}</PopoverTrigger>;
  }
  if (!isValidElement(children)) return <>{children}</>;
  const child = children as VNode<{ onClick?: (event: MouseEvent) => void }>;
  return cloneElement(child, {
    "aria-haspopup": sheet ? "dialog" : undefined,
    onClick: (event: MouseEvent) => {
      child.props.onClick?.(event);
      if (open) onClose("dismiss");
      else onOpen();
    },
  });
}

export type ToolPanelChrome = "heading" | "none";

export type ToolPanelCloseButton = "heading" | "trigger";

export type ToolPanelAnchoring = "bar" | "trigger";

const POPOVER_PLACEMENT = {
  bar: { align: "start", sideOffset: 8, alignOffset: 12 },
  trigger: { align: "end", sideOffset: 18, alignOffset: -8 },
} as const;

export type ToolPanelProps = {
  open: boolean;
  title: string;
  closeLabel: string;
  closeButton?: ToolPanelCloseButton;
  anchoring?: ToolPanelAnchoring;
  chrome?: ToolPanelChrome;
  onClose: (reason: ToolPanelCloseReason) => void;
  onBack?: () => void;
  closeOnOutside?: boolean;
  keepOpenOn?: (target: Element) => boolean;
  returnFocus?: () => HTMLElement | null;
  children?: ComponentChildren;
};

const keepFocus = (event: PointerEvent) => event.preventDefault();

function Heading({
  title,
  closeLabel,
  closeButton,
  onBack,
  onClose,
}: Pick<ToolPanelProps, "title" | "closeLabel" | "closeButton" | "onBack"> & {
  onClose: () => void;
}) {
  const { sheet, keyboard } = useContext(Context);
  const closes = keyboard || closeButton !== "trigger";
  return (
    <header
      class={cn(
        "flex min-h-[52px] flex-none items-center gap-1 border-b border-edge py-1 pl-2.5 pr-2.5",
        keyboard && "absolute inset-x-0 bottom-full h-[52px] bg-panel",
      )}
    >
      {onBack && (
        <Button
          variant="quiet"
          size="icon"
          aria-label="Back to writing tools"
          class="text-muted"
          onPointerDown={keepFocus}
          onClick={onBack}
        >
          <BackIcon />
        </Button>
      )}
      {sheet ? (
        <DialogTitle class="mx-1 min-w-0 flex-1 truncate text-[15px]/[1.4] font-semibold">
          {title}
        </DialogTitle>
      ) : (
        <h2 class="mx-1 min-w-0 flex-1 truncate text-[15px]/[1.4] font-semibold">
          {title}
        </h2>
      )}
      {closes && (
        <Button
          variant="quiet"
          size="icon"
          aria-label={closeLabel}
          class="text-muted"
          onPointerDown={keepFocus}
          onClick={onClose}
        >
          <CloseIcon />
        </Button>
      )}
    </header>
  );
}

const textFieldActive = (active: Element | null): active is HTMLElement =>
  active instanceof HTMLElement &&
  (active.matches("input, textarea") || active.isContentEditable);

function KeyboardPanel({
  title,
  heading,
  close,
  restoresFocus,
  closeOnOutside,
  keepOpenOn,
  returnFocus,
  children,
}: {
  title: string;
  heading: boolean;
  close: (why: ToolPanelCloseReason) => void;
  restoresFocus: (why: ToolPanelCloseReason) => boolean;
  closeOnOutside: boolean;
  keepOpenOn?: (target: Element) => boolean;
  returnFocus?: () => HTMLElement | null;
  children?: ComponentChildren;
}) {
  const panel = useRef<HTMLElement>(null);

  useLayoutEffect(() => workspace.addKeyboardPanel({ heading }), [heading]);

  useLayoutEffect(() => {
    const active = document.activeElement;
    if (textFieldActive(active)) active.blur();
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        panel.current?.contains(target) ||
        !closeOnOutside ||
        keepOpenOn?.(target)
      ) {
        return;
      }
      close("dismiss");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close("escape");
      if (restoresFocus("escape")) {
        returnFocus?.()?.focus({ preventScroll: true });
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, restoresFocus, closeOnOutside, keepOpenOn, returnFocus]);

  return (
    <section
      ref={panel}
      role="dialog"
      aria-label={title}
      data-keyboard-panel
      class="relative z-[301] flex h-[var(--keyboard-height,min(264px,42dvh))] flex-none flex-col bg-panel"
    >
      {children}
    </section>
  );
}

export function ToolPanel({
  open,
  title,
  closeLabel,
  closeButton = "heading",
  anchoring = "bar",
  chrome = "heading",
  onClose,
  onBack,
  closeOnOutside = true,
  keepOpenOn,
  returnFocus,
  children,
}: ToolPanelProps) {
  const { sheet, keyboard } = useContext(Context);
  const reason = useRef<ToolPanelCloseReason>("dismiss");
  const close = (why: ToolPanelCloseReason) => {
    reason.current = why;
    onClose(why);
  };
  const takeCloseReason = () => {
    const why = reason.current;
    reason.current = "dismiss";
    return why;
  };
  const restoresFocus = (why: ToolPanelCloseReason) =>
    why === "close" || why === "escape";
  const body = (
    <>
      {chrome === "heading" ? (
        <Heading
          title={title}
          closeLabel={closeLabel}
          closeButton={closeButton}
          onBack={onBack}
          onClose={() => {
            close("close");
            if (keyboard) returnFocus?.()?.focus({ preventScroll: true });
          }}
        />
      ) : (
        sheet && <DialogTitle class="sr-only">{title}</DialogTitle>
      )}
      <div class="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  );
  if (keyboard) {
    return open ? (
      <KeyboardPanel
        title={title}
        heading={chrome === "heading"}
        close={close}
        restoresFocus={restoresFocus}
        closeOnOutside={closeOnOutside}
        keepOpenOn={keepOpenOn}
        returnFocus={returnFocus}
      >
        {body}
      </KeyboardPanel>
    ) : null;
  }
  if (sheet) {
    return (
      <Sheet
        open={open}
        onOpenChange={(next) => {
          if (!next) close("dismiss");
        }}
        dismissable={closeOnOutside}
        flush
        returnFocus={() =>
          restoresFocus(takeCloseReason())
            ? (returnFocus?.() ?? null)
            : document.body
        }
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          close("escape");
        }}
        class="max-h-[42dvh]"
      >
        {body}
      </Sheet>
    );
  }
  return (
    <PopoverContent
      size="panel"
      side="top"
      {...POPOVER_PLACEMENT[anchoring]}
      class="max-h-[min(var(--radix-popover-content-available-height),640px)]"
      aria-label={title}
      onEscapeKeyDown={(event) => {
        event.preventDefault();
        close("escape");
      }}
      onInteractOutside={(event) => {
        const target = event.target as Element | null;
        if (!closeOnOutside || (target && keepOpenOn?.(target))) {
          event.preventDefault();
          return;
        }
        reason.current = "dismiss";
      }}
      onFocusOutside={(event) => event.preventDefault()}
      onCloseAutoFocus={(event) => {
        const restore = restoresFocus(takeCloseReason());
        const target = restore ? returnFocus?.() : null;
        if (restore && !target?.isConnected) return;
        event.preventDefault();
        target?.focus({ preventScroll: true });
      }}
    >
      {body}
    </PopoverContent>
  );
}
