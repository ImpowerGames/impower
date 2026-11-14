import { cva, type VariantProps } from "class-variance-authority";
import type { RefObject } from "preact";
import { createPortal } from "preact/compat";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import { useEscapeWithin } from "../../utils/escapeWithin";
import Button from "../button/Button";
import { CheckIcon } from "../icon/icons.generated";

export const WHEEL_ROW = 44;

export const WHEEL_SHOWN = 5;

export const wheelIndexAt = (scrollTop: number, count: number, row = WHEEL_ROW): number =>
  Math.max(0, Math.min(count - 1, Math.round(scrollTop / row)));

export type WheelOption = {
  readonly value: string;
  readonly label: string;
  readonly hint?: string;
};

export const wheelPickerVariants = cva(
  [
    "peer relative overflow-y-auto overscroll-contain outline-none [scrollbar-width:none]",
    "snap-y snap-mandatory perspective-[520px]",
    "[mask-image:linear-gradient(transparent,#000_28%,#000_72%,transparent)]",
  ],
  {
    variants: {
      size: {
        default: "h-[220px] py-[88px]",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type WheelPickerSize = NonNullable<VariantProps<typeof wheelPickerVariants>["size"]>;

const wheelRow = [
  "wheel-row-tilt flex h-11 snap-center items-center justify-center gap-2 px-6",
  "text-[16px]/[1.2] text-ink select-none cursor-pointer",
];

const wheelBand = [
  "pointer-events-none absolute inset-x-3 top-1/2 h-11 -translate-y-1/2 rounded-[10px]",
  "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
  "outline-1 -outline-offset-1 outline-solid outline-[color-mix(in_srgb,var(--accent)_35%,transparent)]",
  "peer-focus-visible:outline-accent forced-colors:peer-focus-visible:outline-2 forced-colors:peer-focus-visible:outline-[Highlight]",
];

export type WheelPickerProps = VariantProps<typeof wheelPickerVariants> & {
  label: string;
  options: readonly WheelOption[];
  value: string;
  onCentre?: (value: string) => void;
  onChoose: (value: string) => void;
  listRef?: RefObject<HTMLDivElement>;
  class?: string;
};

const reducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export function WheelPicker({
  label,
  options,
  value,
  onCentre,
  onChoose,
  listRef,
  size,
  class: className,
}: WheelPickerProps) {
  const id = useId();
  const wheel = useRef<HTMLDivElement | null>(null);
  const frame = useRef(0);
  const start = Math.max(0, options.findIndex((option) => option.value === value));
  const [at, setAt] = useState(start);
  const centred = useRef(start);

  const turnTo = (index: number, smooth: boolean) => {
    const element = wheel.current;
    const top = Math.max(0, Math.min(options.length - 1, index)) * WHEEL_ROW;
    if (!element) {
      return;
    }
    if (smooth && !reducedMotion()) {
      element.scrollTo({ top, behavior: "smooth" });
    } else {
      element.scrollTop = top;
    }
  };

  useLayoutEffect(() => {
    turnTo(start, false);
  }, []);

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const settle = () => {
    frame.current = 0;
    const element = wheel.current;
    if (!element) {
      return;
    }
    const index = wheelIndexAt(element.scrollTop, options.length);
    if (index !== centred.current) {
      centred.current = index;
      setAt(index);
      onCentre?.(options[index]!.value);
    }
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const step: Record<string, number> = {
      ArrowDown: 1,
      ArrowUp: -1,
      PageDown: WHEEL_SHOWN - 1,
      PageUp: 1 - WHEEL_SHOWN,
    };
    if (event.key in step) {
      turnTo(centred.current + step[event.key]!, false);
    } else if (event.key === "Home") {
      turnTo(0, false);
    } else if (event.key === "End") {
      turnTo(options.length - 1, false);
    } else if (event.key === "Enter" || event.key === " ") {
      onChoose(options[centred.current]!.value);
    } else {
      return;
    }
    event.preventDefault();
  };

  return (
    <div class="relative" data-wheel-frame>
      <div
        ref={(element: HTMLDivElement | null) => {
          wheel.current = element;
          if (listRef) {
            listRef.current = element;
          }
        }}
        role="listbox"
        tabIndex={0}
        aria-label={label}
        aria-activedescendant={`${id}-${at}`}
        class={cn(wheelPickerVariants({ size }), className)}
        data-wheel-picker
        onScroll={() => {
          frame.current ||= requestAnimationFrame(settle);
        }}
        onKeyDown={onKeyDown}
      >
        {options.map((option, index) => (
          <div
            key={option.value}
            id={`${id}-${index}`}
            role="option"
            aria-selected={index === at}
            class={cn(wheelRow)}
            data-wheel-index={index}
            onClick={() => (index === centred.current ? onChoose(option.value) : turnTo(index, true))}
          >
            <span>{option.label}</span>
            {option.hint ? <small class="text-[11px] text-muted">{option.hint}</small> : null}
            {option.value === value ? <CheckIcon aria-hidden="true" class="size-[15px] text-accent" /> : null}
          </div>
        ))}
      </div>
      <div aria-hidden="true" class={cn(wheelBand)} data-wheel-band />
    </div>
  );
}

export const wheelSheetVariants = cva(
  [
    "absolute inset-x-0 bottom-0 z-20 flex flex-col overflow-hidden",
    "rounded-t-card border border-b-0 border-edge bg-panel text-ink shadow-float",
    "pb-[env(safe-area-inset-bottom)] motion-safe:anim-sheet-in",
  ],
  {
    variants: {
      size: {
        default: "max-h-full",
      },
    },
    defaultVariants: { size: "default" },
  },
);

export type WheelSheetSize = NonNullable<VariantProps<typeof wheelSheetVariants>["size"]>;

export type WheelSheetProps = VariantProps<typeof wheelSheetVariants> & {
  container: RefObject<HTMLElement>;
  open: boolean;
  title: string;
  options: readonly WheelOption[];
  value: string;
  onPreview?: (value: string) => void;
  onChoose: (value: string) => void;
  onCancel: () => void;
  returnFocus?: () => HTMLElement | null;
};

export function WheelSheet({
  container,
  open,
  title,
  options,
  value,
  onPreview,
  onChoose,
  onCancel,
  returnFocus,
  size,
}: WheelSheetProps) {
  const titleId = useId();
  const centred = useRef(value);
  const panel = useRef<HTMLDivElement | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  cancel.current = onCancel;
  const focusBack = useRef(returnFocus);
  focusBack.current = returnFocus;

  useEscapeWithin(panel, open, onCancel);

  useEffect(() => {
    centred.current = value;
  }, [open, value]);

  useLayoutEffect(() => {
    if (!open) {
      return;
    }
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    list.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!panel.current?.contains(target) && !target?.closest?.("[data-zoom-frame]")) {
        cancel.current();
      }
    };
    document.addEventListener("pointerdown", outside, true);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      const returnTo = focusBack.current?.() ?? opener;
      if (returnTo?.isConnected && (!document.activeElement || panel.current?.contains(document.activeElement) || document.activeElement === document.body)) {
        returnTo.focus({ preventScroll: true });
      }
    };
  }, [open]);

  const host = container.current;
  if (!open || !host) {
    return null;
  }
  return createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      class={wheelSheetVariants({ size })}
      data-wheel-sheet
    >
      <div class="flex items-center justify-between gap-2 border-b border-edge px-2 py-1.5">
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <h2 id={titleId} class="m-0 min-w-0 truncate text-[15px] font-semibold">
          {title}
        </h2>
        <Button variant="quiet" class="text-accent" onClick={() => onChoose(centred.current)}>
          Done
        </Button>
      </div>
      <WheelPicker
        label={title}
        options={options}
        value={value}
        onCentre={(next) => {
          centred.current = next;
          onPreview?.(next);
        }}
        onChoose={onChoose}
        listRef={list}
      />
    </div>,
    host,
  );
}

export default WheelPicker;
