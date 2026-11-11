import { cva, type VariantProps } from "class-variance-authority";
import type { RefObject } from "preact";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";
import Button from "../button/Button";
import { DialogTitle, Sheet } from "../dialog/Dialog";
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
    "relative overflow-y-auto overscroll-contain outline-none [scrollbar-width:none]",
    "snap-y snap-mandatory perspective-[600px]",
    "bg-[linear-gradient(transparent_88px,var(--tint)_88px,var(--tint)_132px,transparent_132px)]",
    "focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent focus-visible:outline-solid",
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
  "wheel-row-tilt flex h-11 snap-center items-center justify-center gap-2 px-4",
  "text-[17px]/[1.2] text-muted select-none cursor-pointer",
  "aria-selected:font-semibold aria-selected:text-ink",
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
          {option.hint ? <small class="text-[12px] font-normal text-muted">{option.hint}</small> : null}
          {option.value === value ? <CheckIcon aria-hidden="true" class="size-4 text-accent" /> : null}
        </div>
      ))}
    </div>
  );
}

export type WheelSheetProps = {
  open: boolean;
  title: string;
  options: readonly WheelOption[];
  value: string;
  onPreview?: (value: string) => void;
  onChoose: (value: string) => void;
  onCancel: () => void;
};

export function WheelSheet({ open, title, options, value, onPreview, onChoose, onCancel }: WheelSheetProps) {
  const centred = useRef(value);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => {
    centred.current = value;
  }, [open, value]);
  return (
    <Sheet
      open={open}
      onOpenChange={(next) => !next && onCancel()}
      initialFocus={list}
      flush
      class="pb-[env(safe-area-inset-bottom)]"
    >
      <div class="flex items-center justify-between gap-2 border-b border-edge px-2 py-1.5" data-wheel-sheet>
        <Button variant="quiet" onClick={onCancel}>
          Cancel
        </Button>
        <DialogTitle class="min-w-0 truncate text-[15px]">{title}</DialogTitle>
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
    </Sheet>
  );
}

export default WheelPicker;
