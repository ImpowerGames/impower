import { type ComponentChildren } from "preact";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "../../utils/cn";

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
  /** Minimum percent each panel can shrink to. Default 15. */
  minSize?: number;
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

/**
 * Two-pane split with a drag-resize divider, mirroring sparkle's
 * `<s-split-pane>` behavior:
 *  - drag the divider to resize (keyboard arrows when focused — react-
 *    resizable-panels handles accessibility)
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
  const collapseClass =
    activePanel === "start"
      ? "swp-collapse-active-start"
      : "swp-collapse-active-end";
  const breakpoint = (collapseBelow ?? 0) - 1;

  return (
    <div
      class={cn(
        "flex w-full h-full",
        collapseBelow != null && collapseClass,
        className,
      )}
    >
      {collapseBelow != null && (
        <style>{`
          @media (max-width: ${breakpoint}px) {
            .${collapseClass} [data-separator] {
              display: none !important;
            }
            .swp-collapse-active-start [data-panel]:last-child {
              flex: 0 0 0 !important;
              overflow: hidden !important;
              min-width: 0 !important;
              min-height: 0 !important;
            }
            .swp-collapse-active-end [data-panel]:first-child {
              flex: 0 0 0 !important;
              overflow: hidden !important;
              min-width: 0 !important;
              min-height: 0 !important;
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
        defaultLayout={[defaultSizes[0], defaultSizes[1]]}
        className="flex flex-1 w-full h-full"
      >
        <Panel minSize={minSize} className="overflow-hidden">
          {start}
        </Panel>
        <Separator
          className={cn(
            "bg-border/40 hover:bg-border transition-colors",
            orientation === "horizontal"
              ? "w-px hover:w-1 cursor-col-resize"
              : "h-px hover:h-1 cursor-row-resize",
          )}
        />
        <Panel minSize={minSize} className="overflow-hidden">
          {end}
        </Panel>
      </Group>
    </div>
  );
}
