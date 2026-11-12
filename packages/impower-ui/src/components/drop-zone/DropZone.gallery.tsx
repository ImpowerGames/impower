import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import DropZone from "./DropZone";

function DropZoneDemo() {
  return (
    <div class="space-y-4">
      <GalleryRow label="pane: framing a page, with the folder files land in">
        <div class="relative h-[160px] w-[420px] rounded-[12px] bg-paper">
          <DropZone title="Drop to add to Backdrops" />
        </div>
      </GalleryRow>
      <GalleryRow label="window: over the whole app, with a detail line (shown inside a box here)">
        <div class="relative h-[200px] w-[420px] overflow-hidden rounded-[14px] bg-paper [transform:translateZ(0)]">
          <DropZone scope="window" title="Drop to add to Assets" detail="Each file goes to the folder of its type." />
        </div>
      </GalleryRow>
    </div>
  );
}

export const dropZoneGallery: GalleryEntry = {
  title: "DropZone",
  exports: ["DropZone"],
  Demo: DropZoneDemo,
};
