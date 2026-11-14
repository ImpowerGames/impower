import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import FolderCover from "./FolderCover";

function FolderCoverDemo() {
  return (
    <div class="space-y-4">
      <GalleryRow label="An empty folder, then one to four covers from inside it">
        <div class="flex gap-4">
          {[0, 1, 2, 3, 4].map((count) => (
            <span key={count} class="block h-24 w-36 overflow-hidden rounded-[9px]">
              <FolderCover sources={Array.from({ length: count }, () => SAMPLE_PICTURE)} />
            </span>
          ))}
        </div>
      </GalleryRow>
      <GalleryRow label="A portrait tile's one cover fitted to its height, then four covers at the same shape">
        <div class="flex gap-4">
          {[1, 4].map((count) => (
            <span key={count} class="block h-32 w-24 overflow-hidden rounded-[9px]">
              <FolderCover fit="height" sources={Array.from({ length: count }, () => SAMPLE_PICTURE)} />
            </span>
          ))}
        </div>
      </GalleryRow>
    </div>
  );
}

export const folderCoverGallery: GalleryEntry = {
  title: "FolderCover",
  exports: ["FolderCover", "folderCoverVariants", "FOLDER_COVER_LIMIT"],
  Demo: FolderCoverDemo,
};
