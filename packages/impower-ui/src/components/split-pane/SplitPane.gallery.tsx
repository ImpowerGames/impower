import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { layoutMinWidths } from "../../layout/breakpoints";
import Button from "../button/Button";
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
          orientation={orientation}
          activePanel={active}
          defaultSizes={defaultSizes}
          minSize={minSize}
          start={
            <div class="flex h-full items-center justify-center bg-surface">
              Start panel
            </div>
          }
          end={
            <div class="flex h-full items-center justify-center bg-popup">
              End panel
            </div>
          }
        />
      </div>
    </div>
  );
}

function SplitPaneDemo() {
  return (
    <div class="space-y-6">
      <GalleryRow
        label={`Horizontal: drag the divider or focus it and press the arrow keys. Below ${layoutMinWidths.compact}px wide (the phone layout) only the chosen pane shows.`}
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
    </div>
  );
}

export const splitPaneGallery: GalleryEntry = {
  title: "SplitPane",
  exports: ["SplitPane"],
  Demo: SplitPaneDemo,
};
