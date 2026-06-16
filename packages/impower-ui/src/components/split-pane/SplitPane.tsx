import { cva } from "class-variance-authority";
import { type ComponentChildren } from "preact";
import { Group, Panel, Separator } from "react-resizable-panels";
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

// VSCode-style divider behavior, ported from sparkle's <s-split-pane>:
//   - the Separator is an 8px transparent grab strip (the hit area)
//   - a 1px always-visible line sits centered inside (::before)
//   - a 4px colored indicator fades in on hover/active/focus (::after, 150ms)
// Width/height never change, so the layout doesn't shift during interaction.
// Resting line uses an explicit rgba — impower-ui's --theme-color-divider is
// 0.12 which is too prominent. Sparkle's original used 0.06.
const SEPARATOR_BASE =
  // z-10 lifts the separator above panel-content stacking contexts so the
  // ::after indicator (which extends past the separator's leading edge into
  // the leading panel's area on hover) doesn't get covered by sub-tabs or
  // other panel UI that creates its own stacking context.
  "relative z-10 shrink-0 self-stretch bg-transparent " +
  // ::before — always-visible thin line in resting state
  "before:content-[''] before:absolute before:pointer-events-none before:bg-white/[0.06] " +
  // ::after — fatter colored indicator that fades in on interaction
  "after:content-[''] after:absolute after:pointer-events-none after:bg-primary " +
  "after:opacity-0 after:transition-opacity after:duration-150 after:ease-in-out " +
  // Hover / keyboard-focus / drag-active light up the indicator. :focus-visible
  // only (not :focus) so the indicator releases on mouseup after a drag.
  "hover:after:opacity-100 focus-visible:after:opacity-100 " +
  "data-[separator=hover]:after:opacity-100 data-[separator=active]:after:opacity-100";

// Visible 1px line is centered in the 8px separator (3.5px from leading
// edge). The 4px indicator (hover/focus highlight) is also centered (2px
// from leading edge). Sparkle's s-split-pane positions the line flush
// with the leading panel via absolute overlay, but since react-resizable-
// panels uses an in-layout separator, centering looks more balanced
// regardless of which side has more visible content.
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
 * `<s-split-pane>` behavior:
 *  - drag the divider to resize (keyboard arrows when focused — react-
 *    resizable-panels handles accessibility)
 *  - VSCode-style: wide invisible hit area, thin always-visible divider
 *    line, fatter colored indicator that fades in on hover/active/focus
 *  - per-panel minimum size in % or px (e.g. `minSize="320px"`)
 *  - below `collapseBelow` px, the split collapses and only `activePanel`
 *    is visible — caller drives `activePanel` via a toggle on mobile.
 *
 * Backed by `react-resizable-panels` (Preact-compatible via preact/compat
 * aliasing). We layer responsive collapse on top via a CSS media query —
 * the underlying Group is always rendered, so React state in either pane
 * isn't torn down on every breakpoint cross.
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

  return (
    <div class={cn(splitPaneRoot({ collapseActive }), className)}>
      {/* The responsive-collapse rules are kept in a tiny inline <style>
          because (a) the breakpoint is a runtime prop, so Tailwind can't
          statically generate the arbitrary media-query class, and (b) the
          rules target react-resizable-panels' [data-panel] children, which
          we don't own and can't decorate with Tailwind classes. Hide via
          display:none so each pane's internal scroll state (CodeMirror
          scrollDOM, etc.) survives the collapse/reveal cycle — same trick
          sparkle's <s-split-pane> used. */}
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
      <Group
        orientation={orientation}
        className="flex flex-1 w-full h-full"
      >
        <Panel
          defaultSize={defaultSizes[0]}
          minSize={minSize}
          className="overflow-hidden"
        >
          {start}
        </Panel>
        <Separator
          data-orientation={orientation}
          className={cn(
            SEPARATOR_BASE,
            orientation === "horizontal"
              ? SEPARATOR_HORIZONTAL
              : SEPARATOR_VERTICAL,
          )}
        />
        <Panel
          defaultSize={defaultSizes[1]}
          minSize={minSize}
          className="overflow-hidden"
        >
          {end}
        </Panel>
      </Group>
    </div>
  );
}
