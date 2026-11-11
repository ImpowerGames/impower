import {
  BackIcon,
  Button,
  CloseIcon,
  DialogTitle,
  PanelHead,
  panelHeadTitleVariants,
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

export type ToolPanelPresentation = "popover" | "sheet" | "keyboard" | "bar";

type PanelContext = {
  sheet: boolean;
  keyboard: boolean;
  bar: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: (reason: ToolPanelCloseReason) => void;
};

const Context = createContext<PanelContext>({
  sheet: false,
  keyboard: false,
  bar: false,
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
  const bar = resolved === "bar";
  const value = { sheet, keyboard, bar, open, onOpen, onClose };
  if (sheet || keyboard || bar) {
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
  const { sheet, keyboard, bar } = useContext(Context);
  if (sheet || keyboard || bar) return <>{children}</>;
  return <PopoverAnchor asChild>{children}</PopoverAnchor>;
}

export function ToolPanelTrigger({ children }: { children?: ComponentChildren }) {
  const { sheet, keyboard, bar, open, onOpen, onClose } = useContext(Context);
  if (!sheet && !keyboard && !bar) {
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
  closeButton?: ToolPanelCloseButton;
  anchoring?: ToolPanelAnchoring;
  chrome?: ToolPanelChrome;
  closeLabel?: string;
  onClose: (reason: ToolPanelCloseReason) => void;
  onBack?: () => void;
  backLabel?: string;
  closeOnOutside?: boolean;
  scroll?: boolean;
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
  backLabel = "Back to writing tools",
  onClose,
}: Pick<ToolPanelProps, "title" | "closeLabel" | "closeButton" | "onBack" | "backLabel"> & {
  onClose: () => void;
}) {
  const { sheet, keyboard } = useContext(Context);
  const closes = keyboard || closeButton !== "trigger";
  return (
    <PanelHead
      size="default"
      titleSize="md"
      class={keyboard ? "absolute inset-x-0 bottom-full h-[52px] bg-panel" : undefined}
      title={
        sheet ? (
          <DialogTitle class={panelHeadTitleVariants({ titleSize: "md" })}>{title}</DialogTitle>
        ) : (
          title
        )
      }
      start={
        onBack && (
          <Button
            variant="quiet"
            size="icon"
            aria-label={backLabel}
            class="text-muted"
            onPointerDown={keepFocus}
            onClick={onBack}
          >
            <BackIcon />
          </Button>
        )
      }
      end={
        closes && (
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
        )
      }
    />
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
  closeButton = "heading",
  anchoring = "bar",
  chrome = "heading",
  closeLabel = "Close writing tools",
  onClose,
  onBack,
  backLabel,
  closeOnOutside = true,
  scroll = true,
  keepOpenOn,
  returnFocus,
  children,
}: ToolPanelProps) {
  const { sheet, keyboard, bar } = useContext(Context);
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
          backLabel={backLabel}
          onClose={() => {
            close("close");
            if (keyboard) returnFocus?.()?.focus({ preventScroll: true });
          }}
        />
      ) : (
        sheet && <DialogTitle class="sr-only">{title}</DialogTitle>
      )}
      <div
        class={cn(
          "min-h-0 flex-1",
          scroll ? "overflow-y-auto" : "flex flex-col",
        )}
      >
        {children}
      </div>
    </>
  );
  if (bar) {
    return open ? (
      <section
        aria-label={title}
        class="flex-none"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            close("escape");
          }
        }}
      >
        {children}
      </section>
    ) : null;
  }
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
