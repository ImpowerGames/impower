import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import LoadingBar from "./LoadingBar";

function LoadingBarDemo() {
  return (
    <div class="space-y-4">
      <GalleryRow label="Default (text-primary, full width)">
        <div class="w-full max-w-96">
          <LoadingBar />
        </div>
      </GalleryRow>
      <GalleryRow label="Success colour (text-success)">
        <div class="w-full max-w-96">
          <LoadingBar class="text-success" />
        </div>
      </GalleryRow>
      <GalleryRow label="Danger colour (text-danger)">
        <div class="w-full max-w-96">
          <LoadingBar class="text-danger" />
        </div>
      </GalleryRow>
      <GalleryRow label="Constrained width (w-40, text-warning)">
        <LoadingBar class="w-40 text-warning" />
      </GalleryRow>
      <GalleryRow label="Thicker bar (h-1)">
        <div class="w-full max-w-96">
          <LoadingBar class="h-1" />
        </div>
      </GalleryRow>
    </div>
  );
}

export const loadingBarGallery: GalleryEntry = {
  title: "LoadingBar",
  exports: ["LoadingBar"],
  Demo: LoadingBarDemo,
};
