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
//   - a 1px always-visible line sits centered inside
//   - a 4px colored "indicator" fades in on hover/active/focus (150ms)
// Width/height never change, so the layout doesn't shift during interaction.
const SP_HIT_AREA = "8px";
const SP_DIVIDER = "1px";
const SP_INDICATOR = "4px";
const STYLE = `
  .swp-separator {
    position: relative;
    flex: 0 0 ${SP_HIT_AREA};
    background-color: transparent;
    align-self: stretch;
  }
  .swp-separator[data-orientation="horizontal"] {
    width: ${SP_HIT_AREA};
    cursor: col-resize;
  }
  .swp-separator[data-orientation="vertical"] {
    height: ${SP_HIT_AREA};
    cursor: row-resize;
  }
  .swp-separator::before,
  .swp-separator::after {
    content: "";
    position: absolute;
    pointer-events: none;
  }
  .swp-separator[data-orientation="horizontal"]::before {
    top: 0;
    bottom: 0;
    left: calc((${SP_HIT_AREA} - ${SP_DIVIDER}) / 2);
    width: ${SP_DIVIDER};
    background-color: var(--theme-color-divider, rgba(255, 255, 255, 0.1));
  }
  .swp-separator[data-orientation="vertical"]::before {
    left: 0;
    right: 0;
    top: calc((${SP_HIT_AREA} - ${SP_DIVIDER}) / 2);
    height: ${SP_DIVIDER};
    background-color: var(--theme-color-divider, rgba(255, 255, 255, 0.1));
  }
  .swp-separator[data-orientation="horizontal"]::after {
    top: 0;
    bottom: 0;
    left: calc((${SP_HIT_AREA} - ${SP_INDICATOR}) / 2);
    width: ${SP_INDICATOR};
    background-color: var(--theme-color-primary, #007acc);
    opacity: 0;
    transition: opacity 150ms ease-in-out;
  }
  .swp-separator[data-orientation="vertical"]::after {
    left: 0;
    right: 0;
    top: calc((${SP_HIT_AREA} - ${SP_INDICATOR}) / 2);
    height: ${SP_INDICATOR};
    background-color: var(--theme-color-primary, #007acc);
    opacity: 0;
    transition: opacity 150ms ease-in-out;
  }
  /* Use :focus-visible only — :focus would keep the indicator lit after a
     mouse drag (the Separator stays focused for keyboard accessibility). */
  .swp-separator:hover::after,
  .swp-separator:focus-visible::after,
  .swp-separator[data-separator="hover"]::after,
  .swp-separator[data-separator="active"]::after,
  .swp-separator[data-resize-handle-active]::after {
    opacity: 1;
  }
`;

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
      <style>{STYLE}</style>
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
          data-orientation={orientation}
          className="swp-separator"
        />
        <Panel minSize={minSize} className="overflow-hidden">
          {end}
        </Panel>
      </Group>
    </div>
  );
}
