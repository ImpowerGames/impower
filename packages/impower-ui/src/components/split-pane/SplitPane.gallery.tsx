import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { layoutMinWidths } from "../../layout/breakpoints";
import Button from "../button/Button";
import { cn } from "../../utils/cn";
import SplitPane, { type SplitPaneProps } from "./SplitPane";

function SplitPaneExample({
  orientation,
  defaultSizes,
  minSize,
}: {
  orientation: NonNullable<SplitPaneProps["orientation"]>;
  defaultSizes?: SplitPaneProps["defaultSizes"];
  minSize?: SplitPaneProps["minSize"];
}) {
  const [active, setActive] = useState<"start" | "end">("start");
  return (
    <div class="space-y-2">
      <div class="flex items-center gap-2">
        <span class="text-xs text-foreground/60">Phone-layout pane:</span>
        {(["start", "end"] as const).map((panel) => (
          <Button
            key={panel}
            variant={panel === active ? "primary" : "default"}
            onClick={() => setActive(panel)}
          >
            {panel}
          </Button>
        ))}
      </div>
      <div class="h-72 w-full overflow-hidden rounded border border-surface-border">
        <SplitPane
          class="[--split-start-surface:var(--color-panel)] [--split-end-surface:var(--color-workspace)]"
          orientation={orientation}
          activePanel={active}
          defaultSizes={defaultSizes}
          minSize={minSize}
          start={
            <div class="flex h-full items-center justify-center bg-panel">
              Start panel
            </div>
          }
          end={
            <div class="flex h-full items-center justify-center bg-workspace">
              End panel
            </div>
          }
        />
      </div>
    </div>
  );
}

function PinnedSplitPaneExample({
  reverse = false,
  line,
}: {
  reverse?: boolean;
  line?: SplitPaneProps["line"];
}) {
  const [size, setSize] = useState<number | undefined>(undefined);
  return (
    <div class="space-y-2">
      <span class="text-xs text-foreground/60">
        Saved size: {size === undefined ? "none (default)" : `${size}px`}
      </span>
      <div
        class={cn(
          "h-72 w-full overflow-hidden rounded border border-surface-border",
          line === "none" && "bg-workspace",
        )}
      >
        <SplitPane
          class="[--split-start-surface:var(--color-panel)] [--split-end-surface:var(--color-workspace)]"
          orientation="vertical"
          reverse={reverse}
          line={line}
          label="Resize panel"
          pinned={{
            panel: "end",
            size,
            defaultSize: 44,
            minSize: 144,
            collapsedSize: 44,
            reserve: 120,
            onSizeChange: setSize,
          }}
          start={
            <div class="flex h-full items-center justify-center bg-panel">
              Content
            </div>
          }
          end={
            <div class="flex h-full flex-col bg-workspace">
              <div class="flex h-11 shrink-0 items-center px-3">Bar</div>
              <div class="flex flex-1 items-center justify-center">Panel</div>
            </div>
          }
        />
      </div>
    </div>
  );
}

function OverflowSplitPaneExample() {
  return (
    <div class="h-72 w-full overflow-hidden rounded border border-surface-border bg-surface">
      <SplitPane
        orientation="vertical"
        overflowPanel="start"
        defaultSizes={[60, 40]}
        start={
          <div class="flex h-full flex-col px-3 pt-3">
            <div class="flex flex-1 items-center justify-center rounded-card bg-popup shadow-float">
              Start panel content with a shadow
            </div>
          </div>
        }
        end={
          <div class="flex h-full items-center justify-center">End panel</div>
        }
      />
    </div>
  );
}

function SplitPaneDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow
        label={`Horizontal between two surfaces: the strip shows each pane's own colour up to the 1px edge line. Drag the divider or focus it and press the arrow keys. Below ${layoutMinWidths.compact}px wide (the phone layout) only the chosen pane shows.`}
      >
        <SplitPaneExample orientation="horizontal" />
      </GalleryRow>
      <GalleryRow label="Horizontal at 53:47 with a minimum per pane: the start keeps 280px and the end 336px">
        <SplitPaneExample
          orientation="horizontal"
          defaultSizes={[53, 47]}
          minSize={["280px", "336px"]}
        />
      </GalleryRow>
      <GalleryRow label="Vertical">
        <SplitPaneExample orientation="vertical" />
      </GalleryRow>
      <GalleryRow label="Vertical with a pinned end panel: drag it up past 144px to open it, below that it snaps to the 44px bar; Up and Down step it, Home collapses, End keeps 120px for the stage, Enter or double-click resets">
        <PinnedSplitPaneExample />
      </GalleryRow>
      <GalleryRow label="Vertical, reversed, with the pinned end panel shown first: drag and the arrow keys follow what is on screen">
        <PinnedSplitPaneExample reverse />
      </GalleryRow>
      <GalleryRow label="Vertical with line none, for a divider inside one surface: nothing is drawn at rest and the strip shows the surface behind the split, while hover, focus and drag still show the accent bar">
        <PinnedSplitPaneExample line="none" />
      </GalleryRow>
      <GalleryRow label="Vertical with the start panel allowed to overflow: its content's shadow falls past the divider onto the end panel, while the end panel still clips">
        <OverflowSplitPaneExample />
      </GalleryRow>
    </div>
  );
}

export const splitPaneGallery: GalleryEntry = {
  title: "SplitPane",
  exports: ["SplitPane"],
  Demo: SplitPaneDemo,
};
