import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { announce } from "../../hooks/useAnnouncer";
import Button from "../button/Button";
import LiveRegion, { type LiveRegionVisibility } from "./LiveRegion";

const VISIBILITY: Record<LiveRegionVisibility, string> = {
  hidden: "Hidden (the app's one region)",
  visible: "Visible (this gallery's echo)",
};

function LiveRegionDemo() {
  return (
    <GalleryRow label="announce() writes to the region; the visible one shows what a screen reader hears">
      <div class="flex flex-wrap items-center gap-4">
        <Button onClick={() => announce("Line numbers on.")}>Announce a switch</Button>
        <Button onClick={() => announce("Scene numbers: Left.")}>Announce a choice</Button>
        {(Object.keys(VISIBILITY) as LiveRegionVisibility[]).map((visibility) => (
          <span key={visibility} class="flex items-center gap-2 text-xs text-muted">
            {VISIBILITY[visibility]}: <LiveRegion visibility={visibility} />
          </span>
        ))}
      </div>
    </GalleryRow>
  );
}

export const liveRegionGallery: GalleryEntry = {
  title: "LiveRegion",
  exports: ["LiveRegion", "liveRegionVariants", "announce", "useAnnouncer"],
  Demo: LiveRegionDemo,
};
