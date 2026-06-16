import { cva } from "class-variance-authority";
import { type ComponentChildren } from "preact";
import { useRef, useState } from "preact/hooks";
import { cn } from "../../utils/cn";

const splitPaneRoot = cva("flex w-full h-full", {
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
  /**
   * Drag-resize axis. "horizontal" splits left/right (default),
   * "vertical" splits top/bottom.
   */
  orientation?: "horizontal" | "vertical";
  /** Content for the leading panel (top or left). */
  start: ComponentChildren;
  /** Content for the trailing panel (bottom or right). */
  end: ComponentChildren;
  /** Default sizes in percent. Defaults to [50, 50]. */
  defaultSizes?: [number, number];
  /**
   * Minimum size each panel can shrink to. Pass a number for percent
   * (`15` → 15%), or a string with units (`"320px"`, `"20rem"`). Default 15%.
   */
  minSize?: number | string;
  /**
   * Collapse the split below this viewport-width breakpoint (px) and show
   * only the `activePanel` instead. Pass `null` to disable. Default 768
   * (Tailwind `md`).
   */
  collapseBelow?: number | null;
  /** When collapsed, which side is shown. Caller drives this via a toggle. */
  activePanel?: "start" | "end";
  /** Tailwind classes for the outer wrapper. */
  class?: string;
};

const DIVIDER_PX = 8;

// Resolve the per-panel minimum to pixels, given the available track length
// (container minus the divider). Numbers are percents; strings carry units.
function minToPx(minSize: number | string, trackPx: number): number {
  if (typeof minSize === "number") return (minSize / 100) * trackPx;
  const s = String(minSize).trim();
  if (s.endsWith("px")) return parseFloat(s) || 0;
  if (s.endsWith("rem")) return (parseFloat(s) || 0) * 16;
  if (s.endsWith("%")) return ((parseFloat(s) || 0) / 100) * trackPx;
  const n = parseFloat(s);
  return Number.isFinite(n) ? (n / 100) * trackPx : 0;
}

// VSCode-style divider behavior, ported from sparkle's <s-split-pane>:
//   - the divider is an 8px transparent grab strip (the hit area)
//   - a 1px always-visible line sits centered inside (::before)
//   - a 4px colored indicator fades in on hover/active/focus (::after, 150ms)
// Width/height never change, so the layout doesn't shift during interaction.
// Resting line uses an explicit rgba — impower-ui's --theme-color-divider is
// 0.12 which is too prominent. Sparkle's original used 0.06.
const SEPARATOR_BASE =
  // z-10 lifts the divider above panel-content stacking contexts so the
  // ::after indicator (which extends past the divider's leading edge into
  // the leading panel's area on hover) doesn't get covered by sub-tabs or
  // other panel UI that creates its own stacking context. pointer-events-auto
  // re-asserts hit-testing (sparkle's normalize sets `* { pointer-events:none }`)
  // and touch-none lets a touch drag the divider without page-scrolling.
  "relative z-10 shrink-0 self-stretch select-none bg-transparent pointer-events-auto touch-none " +
  // ::before — always-visible thin line in resting state
  "before:content-[''] before:absolute before:pointer-events-none before:bg-white/[0.06] " +
  // ::after — fatter colored indicator that fades in on interaction
  "after:content-[''] after:absolute after:pointer-events-none after:bg-primary " +
  "after:opacity-0 after:transition-opacity after:duration-150 after:ease-in-out " +
  // Hover / keyboard-focus / drag-active light up the indicator. :focus-visible
  // only (not :focus) so the indicator releases on mouseup after a drag.
  "hover:after:opacity-100 focus-visible:after:opacity-100 " +
  "data-[separator=active]:after:opacity-100";

// Visible 1px line is centered in the 8px divider (3.5px from leading edge).
// The 4px indicator (hover/focus highlight) is also centered (2px from leading
// edge).
const SEPARATOR_HORIZONTAL =
  "w-2 cursor-col-resize " +
  "before:inset-y-0 before:left-[3.5px] before:w-px " +
  "after:inset-y-0 after:left-[2px] after:w-1";

const SEPARATOR_VERTICAL =
  "h-2 cursor-row-resize " +
  "before:inset-x-0 before:top-[3.5px] before:h-px " +
  "after:inset-x-0 after:top-[2px] after:h-1";

/**
 * Two-pane split with a drag-resize divider, mirroring sparkle's
 * `<s-split-pane>`:
 *  - drag the divider to resize (arrow keys when focused)
 *  - VSCode-style: wide invisible hit area, thin always-visible divider line,
 *    fatter colored indicator that fades in on hover/active/focus
 *  - per-panel minimum size in % or px (e.g. `minSize="320px"`)
 *  - below `collapseBelow` px, the split collapses and only `activePanel`
 *    is visible — caller drives `activePanel` via a toggle on mobile.
 *
 * Custom flex + pointer implementation (NOT react-resizable-panels — its v4
 * resize store is non-functional under preact/compat: drag + keyboard both
 * no-op). The two panes split the track via `flex-grow` ratios (the 8px divider
 * is a fixed flex item), so the layout self-adjusts for the divider width; a
 * pointer drag updates the leading pane's percentage, clamped to `minSize`.
 * Both panes stay mounted across the responsive collapse (display:none toggle)
 * so each pane's internal scroll state (CodeMirror scrollDOM, etc.) survives.
 */
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

  // Leading-pane size as a percentage of the track (container minus divider).
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
    el.dataset.separator = "active";
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
      /* capture may already be released */
    }
    el.dataset.separator = "";
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const dec = horizontal ? "ArrowLeft" : "ArrowUp";
    const inc = horizontal ? "ArrowRight" : "ArrowDown";
    if (e.key !== dec && e.key !== inc) return;
    e.preventDefault();
    const track = trackPx();
    const minPct = track > 0 ? (minToPx(minSize, track) / track) * 100 : 10;
    const STEP = 2; // percent per keypress
    setSize((s) =>
      Math.max(minPct, Math.min(100 - minPct, s + (e.key === inc ? STEP : -STEP))),
    );
  };

  return (
    <div class={cn(splitPaneRoot({ collapseActive }), className)}>
      {/* The responsive-collapse rules live in a tiny inline <style> because
          the breakpoint is a runtime prop (Tailwind can't statically generate
          the arbitrary media query). Hide via display:none so each pane's
          internal scroll state survives the collapse/reveal cycle. */}
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
        // Inline flex-direction beats sparkle's normalize `* { flex-flow: column }`.
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
