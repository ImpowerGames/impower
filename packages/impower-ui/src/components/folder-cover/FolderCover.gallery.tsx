import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import FolderCover from "./FolderCover";

function FolderCoverDemo() {
  return (
    <GalleryRow label="An empty folder, then one to four covers from inside it">
      <div class="flex gap-4">
        {[0, 1, 2, 3, 4].map((count) => (
          <span key={count} class="block h-24 w-36 overflow-hidden rounded-[9px]">
            <FolderCover sources={Array.from({ length: count }, () => SAMPLE_PICTURE)} />
          </span>
        ))}
      </div>
    </GalleryRow>
  );
}

export const folderCoverGallery: GalleryEntry = {
  title: "FolderCover",
  exports: ["FolderCover", "folderCoverVariants", "FOLDER_COVER_LIMIT"],
  Demo: FolderCoverDemo,
};
