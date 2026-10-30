import { cva } from "class-variance-authority";
import { type ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";

const splitPaneRoot = cva("flex flex-col w-full h-full", {
  variants: {
    collapseActive: {
      none: "",
      start: "swp-collapse-active-start",
      end: "swp-collapse-active-end",
    },
  },
  defaultVariants: { collapseActive: "none" },
});

export type SplitPaneProps = {
  orientation?: "horizontal" | "vertical";
  start: ComponentChildren;
  end: ComponentChildren;
  defaultSizes?: [number, number];
  minSize?: number | string;
  collapseBelow?: number | null;
  activePanel?: "start" | "end";
  class?: string;
};

const DIVIDER_PX = 8;

function minToPx(minSize: number | string, trackPx: number): number {
  if (typeof minSize === "number") return (minSize / 100) * trackPx;
  const s = String(minSize).trim();
  if (s.endsWith("px")) return parseFloat(s) || 0;
  if (s.endsWith("rem")) return (parseFloat(s) || 0) * 16;
  if (s.endsWith("%")) return ((parseFloat(s) || 0) / 100) * trackPx;
  const n = parseFloat(s);
  return Number.isFinite(n) ? (n / 100) * trackPx : 0;
}

const SEPARATOR_BASE =
  "relative z-10 shrink-0 self-stretch select-none bg-transparent touch-none " +
  "before:content-[''] before:absolute before:pointer-events-none before:bg-white/[0.06] " +
  "after:content-[''] after:absolute after:pointer-events-none after:bg-primary " +
  "after:opacity-0 after:transition-opacity after:duration-150 after:ease-in-out " +
  "hover:after:opacity-100 focus-visible:after:opacity-100 " +
  "data-[separator=active]:after:opacity-100";

const SEPARATOR_HORIZONTAL =
  "w-2 cursor-col-resize " +
  "before:inset-y-0 before:left-[3.5px] before:w-px " +
  "after:inset-y-0 after:left-[2px] after:w-1";

const SEPARATOR_VERTICAL =
  "h-2 cursor-row-resize " +
  "before:inset-x-0 before:top-[3.5px] before:h-px " +
  "after:inset-x-0 after:top-[2px] after:h-1";

export default function SplitPane({
  orientation = "horizontal",
  start,
  end,
  defaultSizes = [50, 50],
  minSize = 15,
  collapseBelow = 768,
  activePanel = "start",
  class: className,
}: SplitPaneProps) {
  const collapseActive =
    collapseBelow == null ? "none" : activePanel === "end" ? "end" : "start";
  const collapseClass =
    activePanel === "start"
      ? "swp-collapse-active-start"
      : "swp-collapse-active-end";
  const breakpoint = (collapseBelow ?? 0) - 1;
  const horizontal = orientation === "horizontal";

  const [size, setSize] = useState(defaultSizes[0]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const trackPx = () => {
    const c = containerRef.current;
    if (!c) return 0;
    const r = c.getBoundingClientRect();
    return (horizontal ? r.width : r.height) - DIVIDER_PX;
  };

  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    draggingRef.current = true;
    el.dataset["separator"] = "active";
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!draggingRef.current) return;
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const track = (horizontal ? r.width : r.height) - DIVIDER_PX;
    if (track <= 0) return;
    const pos =
      (horizontal ? e.clientX - r.left : e.clientY - r.top) - DIVIDER_PX / 2;
    const min = minToPx(minSize, track);
    const startPx = Math.max(min, Math.min(track - min, pos));
    setSize((startPx / track) * 100);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    const el = e.currentTarget as HTMLElement;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
    }
    el.dataset["separator"] = "";
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const dec = horizontal ? "ArrowLeft" : "ArrowUp";
    const inc = horizontal ? "ArrowRight" : "ArrowDown";
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const track = trackPx();
    const minPct = track > 0 ? (minToPx(minSize, track) / track) * 100 : 10;
    const STEP = 2;
    setSize((s) =>
      Math.max(minPct, Math.min(100 - minPct, s + (e.key === inc ? STEP : -STEP))),
    );
  };

  return (
    <div class={cn(splitPaneRoot({ collapseActive }), className)}>
      {
}
      {collapseBelow != null && (
        <style>{`
          @media (max-width: ${breakpoint}px) {
            .${collapseClass} [data-separator] {
              display: none !important;
            }
            .swp-collapse-active-start [data-panel]:last-child {
              display: none !important;
            }
            .swp-collapse-active-end [data-panel]:first-child {
              display: none !important;
            }
            .swp-collapse-active-start [data-panel]:first-child,
            .swp-collapse-active-end [data-panel]:last-child {
              flex: 1 1 100% !important;
            }
          }
        `}</style>
      )}
      <div
        ref={containerRef}
        class="flex flex-1 w-full h-full min-h-0 min-w-0"
        style={{ flexDirection: horizontal ? "row" : "column" }}
      >
        <div
          data-panel
          class="overflow-hidden min-h-0 min-w-0"
          style={{ flexGrow: size, flexShrink: 1, flexBasis: 0 }}
        >
          {start}
        </div>
        <div
          data-separator
          data-orientation={orientation}
          role="separator"
          aria-orientation={horizontal ? "vertical" : "horizontal"}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(size)}
          tabIndex={0}
          class={cn(
            SEPARATOR_BASE,
            horizontal ? SEPARATOR_HORIZONTAL : SEPARATOR_VERTICAL,
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
        />
        <div
          data-panel
          class="overflow-hidden min-h-0 min-w-0"
          style={{ flexGrow: 100 - size, flexShrink: 1, flexBasis: 0 }}
        >
          {end}
        </div>
      </div>
    </div>
  );
}
