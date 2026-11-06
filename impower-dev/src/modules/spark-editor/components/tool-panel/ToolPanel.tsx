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
import { useContext, useRef } from "preact/hooks";

export type ToolPanelCloseReason = "close" | "escape" | "dismiss";

export type ToolPanelPresentation = "popover" | "sheet";

type PanelContext = {
  sheet: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: (reason: ToolPanelCloseReason) => void;
};

const Context = createContext<PanelContext>({
  sheet: false,
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
  const sheet =
    (presentation ?? (layout === "phone" ? "sheet" : "popover")) === "sheet";
  const value = { sheet, open, onOpen, onClose };
  if (sheet) {
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
  const { sheet } = useContext(Context);
  if (sheet) return <>{children}</>;
  return <PopoverAnchor asChild>{children}</PopoverAnchor>;
}

export function ToolPanelTrigger({ children }: { children?: ComponentChildren }) {
  const { sheet, open, onOpen, onClose } = useContext(Context);
  if (!sheet) return <PopoverTrigger asChild>{children}</PopoverTrigger>;
  if (!isValidElement(children)) return <>{children}</>;
  const child = children as VNode<{ onClick?: (event: MouseEvent) => void }>;
  return cloneElement(child, {
    "aria-haspopup": "dialog",
    onClick: (event: MouseEvent) => {
      child.props.onClick?.(event);
      if (open) onClose("dismiss");
      else onOpen();
    },
  });
}

export type ToolPanelChrome = "heading" | "none";

export type ToolPanelProps = {
  open: boolean;
  title: string;
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
  onBack,
  onClose,
}: Pick<ToolPanelProps, "title" | "onBack"> & { onClose: () => void }) {
  const { sheet } = useContext(Context);
  return (
    <header class="flex min-h-[52px] flex-none items-center gap-1 border-b border-edge py-1 pl-2.5 pr-2.5">
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
      <Button
        variant="quiet"
        size="icon"
        aria-label="Close writing tools"
        class="text-muted"
        onPointerDown={keepFocus}
        onClick={onClose}
      >
        <CloseIcon />
      </Button>
    </header>
  );
}

export function ToolPanel({
  open,
  title,
  chrome = "heading",
  onClose,
  onBack,
  closeOnOutside = true,
  keepOpenOn,
  returnFocus,
  children,
}: ToolPanelProps) {
  const { sheet } = useContext(Context);
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
        <Heading title={title} onBack={onBack} onClose={() => close("close")} />
      ) : (
        sheet && <DialogTitle class="sr-only">{title}</DialogTitle>
      )}
      <div class="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </>
  );
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
      align="start"
      sideOffset={8}
      alignOffset={12}
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
