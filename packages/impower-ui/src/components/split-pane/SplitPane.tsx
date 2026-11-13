import { type ComponentChildren, type JSX } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { useLayout } from "../../hooks/useLayout";
import { cn } from "../../utils/cn";
import {
  collapsibleSize,
  collapsibleSizeAfterKey,
  type CollapsibleLimits,
} from "../../utils/collapsibleSize";

export type SplitPanePinned = {
  panel: "start" | "end";
  size?: number;
  defaultSize: number;
  minSize: number;
  collapsedSize: number;
  reserve: number;
  onSizeChange: (size: number | undefined) => void;
};

export type SplitPaneProps = {
  orientation?: "horizontal" | "vertical";
  start: ComponentChildren;
  end: ComponentChildren;
  defaultSizes?: [number, number];
  minSize?: MinSize | readonly [MinSize, MinSize];
  activePanel?: "start" | "end";
  reverse?: boolean;
  pinned?: SplitPanePinned;
  label?: string;
  overflowPanel?: "start" | "end";
  class?: string;
};

type MinSize = number | string;

const DIVIDER_PX = 8;

function minToPx(minSize: MinSize, trackPx: number): number {
  if (typeof minSize === "number") return (minSize / 100) * trackPx;
  const s = String(minSize).trim();
  if (s.endsWith("px")) return parseFloat(s) || 0;
  if (s.endsWith("rem")) return (parseFloat(s) || 0) * 16;
  if (s.endsWith("%")) return ((parseFloat(s) || 0) / 100) * trackPx;
  const n = parseFloat(s);
  return Number.isFinite(n) ? (n / 100) * trackPx : 0;
}

function panelStyle(
  hidden: boolean,
  collapsed: boolean,
  grow: number,
): JSX.CSSProperties {
  if (hidden) return { display: "none" };
  if (collapsed) return { flex: "1 1 100%" };
  return { flexGrow: grow, flexBasis: 0 };
}

const PINNED_PANEL = "flex-none basis-(--split-pinned-size)";
const FILL_PANEL = "flex-1 basis-0";

const SEPARATOR_BASE =
  "relative z-10 shrink-0 self-stretch select-none bg-transparent touch-none " +
  "before:content-[''] before:absolute before:pointer-events-none before:bg-edge " +
  "after:content-[''] after:absolute after:pointer-events-none after:bg-primary " +
  "after:opacity-0 motion-safe:after:transition-opacity motion-safe:after:duration-150 motion-safe:after:ease-in-out " +
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
  activePanel = "start",
  reverse = false,
  pinned,
  label,
  overflowPanel,
  class: className,
}: SplitPaneProps) {
  const collapsed = useLayout() === "phone";
  const startHidden = collapsed && activePanel === "end";
  const endHidden = collapsed && activePanel === "start";
  const horizontal = orientation === "horizontal";

  const [size, setSize] = useState(defaultSizes[0]);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const draggingRef = useRef(false);

  const [track, setTrack] = useState(Number.POSITIVE_INFINITY);
  const [pending, setPending] = useState<number | null>(null);
  const pinnedDrag = useRef<{ pos: number; size: number; last: number } | null>(
    null,
  );

  const pinnedValue = pinned?.size;
  useEffect(() => {
    if (!pinnedDrag.current) {
      setPending(null);
    }
  }, [pinnedValue]);

  const tracksPinned = !!pinned;
  useEffect(() => {
    const el = containerRef.current;
    if (!tracksPinned || !el || typeof ResizeObserver === "undefined") {
      return;
    }
    const measure = () => {
      const extent = horizontal ? el.clientWidth : el.clientHeight;
      setTrack(
        extent > 0 ? extent - DIVIDER_PX : Number.POSITIVE_INFINITY,
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [tracksPinned, horizontal]);

  const limits: CollapsibleLimits | null = pinned
    ? {
        min: pinned.minSize,
        max: track - pinned.reserve,
        collapsed: pinned.collapsedSize,
      }
    : null;
  const pinnedSize =
    pinned && limits
      ? collapsibleSize(pending ?? pinned.size ?? pinned.defaultSize, limits)
      : 0;
  const pinnedCollapsed = !!pinned && pinnedSize === pinned.collapsedSize;
  const firstPanel = reverse ? "end" : "start";
  const pinnedSign = pinned?.panel === firstPanel ? 1 : -1;

  const [minStart, minEnd] = Array.isArray(minSize)
    ? (minSize as readonly [MinSize, MinSize])
    : [minSize as MinSize, minSize as MinSize];

  const trackPx = () => {
    const c = containerRef.current;
    if (!c) return 0;
    const r = c.getBoundingClientRect();
    return (horizontal ? r.width : r.height) - DIVIDER_PX;
  };

  const pointerPos = (e: PointerEvent) => (horizontal ? e.clientX : e.clientY);

  const onPointerDown = (e: PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    el.dataset["separator"] = "active";
    if (pinned) {
      el.focus({ preventScroll: true });
      pinnedDrag.current = {
        pos: pointerPos(e),
        size: pinnedSize,
        last: pointerPos(e),
      };
      setPending(pinnedSize);
    }
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!draggingRef.current) return;
    const drag = pinnedDrag.current;
    if (pinned && drag) {
      drag.last = pointerPos(e);
      setPending(drag.size + pinnedSign * (drag.last - drag.pos));
      return;
    }
    const c = containerRef.current;
    if (!c) return;
    const r = c.getBoundingClientRect();
    const track = (horizontal ? r.width : r.height) - DIVIDER_PX;
    if (track <= 0) return;
    const pos =
      (horizontal ? e.clientX - r.left : e.clientY - r.top) - DIVIDER_PX / 2;
    const startPx = Math.max(
      minToPx(minStart, track),
      Math.min(track - minToPx(minEnd, track), pos),
    );
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
    const drag = pinnedDrag.current;
    if (pinned && limits && drag) {
      pinnedDrag.current = null;
      const end = e.type === "pointerup" ? pointerPos(e) : drag.last;
      const next = collapsibleSize(
        drag.size + pinnedSign * (end - drag.pos),
        limits,
      );
      setPending(next);
      pinned.onSizeChange(next);
    }
  };

  const resetPinned = () => {
    if (!pinned) return;
    setPending(null);
    pinned.onSizeChange(undefined);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const dec = horizontal ? "ArrowLeft" : "ArrowUp";
    const inc = horizontal ? "ArrowRight" : "ArrowDown";
    if (pinned && limits) {
      if (e.key === "Enter") {
        e.preventDefault();
        resetPinned();
        return;
      }
      const keys =
        pinnedSign > 0 ? { grow: inc, shrink: dec } : { grow: dec, shrink: inc };
      const next = collapsibleSizeAfterKey(
        e.key,
        e.shiftKey,
        pinnedSize,
        limits,
        keys,
      );
      if (next === null) return;
      e.preventDefault();
      setPending(next);
      pinned.onSizeChange(next);
      return;
    }
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const track = trackPx();
    const pct = (min: MinSize) =>
      track > 0 ? (minToPx(min, track) / track) * 100 : 10;
    const STEP = 2;
    setSize((s) =>
      Math.max(
        pct(minStart),
        Math.min(100 - pct(minEnd), s + (e.key === inc ? STEP : -STEP)),
      ),
    );
  };

  const panelProps = (panel: "start" | "end", hidden: boolean) => {
    const clip = cn(
      overflowPanel === panel ? "overflow-visible" : "overflow-hidden",
      "min-h-0 min-w-0",
    );
    if (pinned && !collapsed) {
      return {
        class: cn(clip, pinned.panel === panel ? PINNED_PANEL : FILL_PANEL),
      };
    }
    return {
      class: clip,
      style: panelStyle(
        hidden,
        collapsed,
        panel === "start" ? size : 100 - size,
      ),
    };
  };

  const pinnedStyle = pinned
    ? ({ "--split-pinned-size": `${pinnedSize}px` } as JSX.CSSProperties)
    : undefined;

  const valueNow = pinned ? pinnedSize : Math.round(size);
  const valueMin = pinned ? pinned.collapsedSize : 0;
  const valueMax = pinned
    ? Math.round(Math.max(pinned.collapsedSize, limits?.max ?? 0))
    : 100;

  return (
    <div
      class={cn("flex flex-col w-full h-full", className)}
      data-split={pinned ? (pinnedCollapsed ? "collapsed" : "expanded") : undefined}
    >
      <div
        ref={containerRef}
        style={pinnedStyle}
        class={cn(
          "flex flex-1 w-full h-full min-h-0 min-w-0",
          horizontal
            ? reverse
              ? "flex-row-reverse"
              : "flex-row"
            : reverse
              ? "flex-col-reverse"
              : "flex-col",
        )}
      >
        <div data-panel="start" {...panelProps("start", startHidden)}>
          {start}
        </div>
        <div
          data-separator
          data-orientation={orientation}
          role="separator"
          aria-label={label}
          aria-orientation={horizontal ? "vertical" : "horizontal"}
          aria-valuemin={valueMin}
          aria-valuemax={valueMax}
          aria-valuenow={valueNow}
          tabIndex={0}
          class={cn(
            SEPARATOR_BASE,
            horizontal ? SEPARATOR_HORIZONTAL : SEPARATOR_VERTICAL,
            collapsed && "hidden",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDblClick={pinned ? resetPinned : undefined}
          onKeyDown={onKeyDown}
        />
        <div data-panel="end" {...panelProps("end", endHidden)}>
          {end}
        </div>
      </div>
    </div>
  );
}
