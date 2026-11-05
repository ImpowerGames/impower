import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Ripple from "./Ripple";

function RippleDemo() {
  return (
    <GalleryRow label="Press inside the box: the ripple grows from the pointer in currentColor">
      <div class="relative flex h-24 w-64 select-none items-center justify-center rounded-lg border border-surface-border bg-surface text-sm text-foreground">
        Press here
        <Ripple />
      </div>
    </GalleryRow>
  );
}

export const rippleGallery: GalleryEntry = {
  title: "Ripple",
  exports: ["Ripple"],
  Demo: RippleDemo,
};
