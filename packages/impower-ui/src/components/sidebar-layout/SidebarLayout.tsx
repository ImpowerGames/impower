import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";

export type SidebarLimits = {
  min: number;
  max: number;
  collapsed: number;
};

export function sidebarWidth(value: number, limits: SidebarLimits): number {
  const ceiling = Math.max(limits.collapsed, limits.max);
  const width = Math.min(ceiling, Math.max(limits.collapsed, value));
  return width < limits.min ? limits.collapsed : Math.round(width);
}

export function sidebarWidthAfterKey(
  key: string,
  shift: boolean,
  width: number,
  limits: SidebarLimits,
): number | null {
  const step = shift ? 64 : 16;
  switch (key) {
    case "Home":
      return limits.collapsed;
    case "End":
      return sidebarWidth(limits.max, limits);
    case "ArrowRight":
      return width === limits.collapsed
        ? sidebarWidth(limits.min, limits)
        : sidebarWidth(width + step, limits);
    case "ArrowLeft":
      return sidebarWidth(width - step, limits);
    default:
      return null;
  }
}

export const sidebarLayoutVariants = cva(
  [
    "group/sidebar relative grid h-full w-full min-h-0 min-w-0",
    "grid-cols-[var(--sidebar-width)_minmax(0,1fr)] grid-rows-[auto_minmax(0,1fr)]",
  ],
  {
    variants: {
      resizing: {
        true: "cursor-col-resize select-none",
        false: "",
      },
    },
    defaultVariants: { resizing: false },
  },
);

const handle = [
  "relative z-20 col-start-1 row-start-2 w-2 translate-x-1/2 justify-self-end self-stretch",
  "cursor-col-resize touch-none select-none bg-transparent outline-none",
  "after:pointer-events-none after:absolute after:inset-y-0 after:left-[2px] after:w-1 after:bg-accent after:opacity-0",
  "motion-safe:after:transition-opacity motion-safe:after:duration-150 motion-safe:after:ease-in-out",
  "hover:after:opacity-100 focus-visible:after:opacity-100 data-[active]:after:opacity-100",
].join(" ");

export type SidebarLayoutVariantProps = VariantProps<
  typeof sidebarLayoutVariants
>;

export type SidebarLayoutProps = {
  header?: ComponentChildren;
  sidebar: ComponentChildren;
  children: ComponentChildren;
  width?: number;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  collapsedWidth: number;
  reserve?: number;
  onWidthChange: (width: number | undefined) => void;
  resizeLabel: string;
  class?: string;
};

export default function SidebarLayout({
  header,
  sidebar,
  children,
  width,
  defaultWidth,
  minWidth,
  maxWidth,
  collapsedWidth,
  reserve = 0,
  onWidthChange,
  resizeLabel,
  class: className,
}: SidebarLayoutProps) {
  const root = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState(Number.POSITIVE_INFINITY);
  const [pending, setPending] = useState<number | null>(null);
  const [resizing, setResizing] = useState(false);
  const drag = useRef<{ x: number; width: number } | null>(null);

  useEffect(() => {
    if (!drag.current) {
      setPending(null);
    }
  }, [width]);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () =>
      setAvailable(
        el.clientWidth > 0
          ? el.clientWidth - reserve
          : Number.POSITIVE_INFINITY,
      );
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [reserve]);

  const limits: SidebarLimits = {
    min: minWidth,
    max: Math.min(maxWidth, available),
    collapsed: collapsedWidth,
  };
  const current = sidebarWidth(pending ?? width ?? defaultWidth, limits);
  const collapsed = current === collapsedWidth;

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) {
      return;
    }
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    el.focus({ preventScroll: true });
    drag.current = { x: e.clientX, width: current };
    setPending(current);
    setResizing(true);
  };

  const onPointerMove = (e: PointerEvent) => {
    const start = drag.current;
    if (!start) {
      return;
    }
    setPending(start.width + e.clientX - start.x);
  };

  const finish = () => {
    if (!drag.current) {
      return;
    }
    drag.current = null;
    setResizing(false);
    setPending(current);
    onWidthChange(current);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      reset();
      return;
    }
    const next = sidebarWidthAfterKey(e.key, e.shiftKey, current, limits);
    if (next === null) {
      return;
    }
    e.preventDefault();
    setPending(next);
    onWidthChange(next);
  };

  const reset = () => {
    setPending(defaultWidth);
    onWidthChange(undefined);
  };

  const style = {
    "--sidebar-width": `${current}px`,
  } as JSX.CSSProperties;

  return (
    <div
      ref={root}
      class={cn(sidebarLayoutVariants({ resizing }), className)}
      style={style}
      data-sidebar={collapsed ? "collapsed" : "expanded"}
    >
      <div class="col-span-2 row-start-1 min-w-0">{header}</div>
      <div class="col-start-1 row-start-2 min-h-0 min-w-0 overflow-hidden">
        {sidebar}
      </div>
      <div class="col-start-2 row-start-2 min-h-0 min-w-0">{children}</div>
      <div
        role="separator"
        tabIndex={0}
        aria-label={resizeLabel}
        aria-orientation="vertical"
        aria-valuemin={collapsedWidth}
        aria-valuemax={Math.round(Math.max(collapsedWidth, limits.max))}
        aria-valuenow={current}
        aria-valuetext={collapsed ? "Icon rail" : `${current} pixels`}
        data-active={resizing ? "" : undefined}
        class={handle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onDblClick={reset}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
