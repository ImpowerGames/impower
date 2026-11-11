import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import DetailList, { type DetailListSize } from "./DetailList";

const SIZES: Record<DetailListSize, string> = { sm: "Small, 12px", md: "Medium, 14px" };

const ROWS = [
  { label: "Type", value: "Image · PNG" },
  { label: "Add menu", value: "Backdrop, from the Backdrops folder" },
  { label: "Size", value: "1920 × 1080" },
  { label: "File", value: "1.2 MB" },
  { label: "Where", value: "Images/Backdrops/a folder with a long name that wraps onto a second line" },
];

function DetailListDemo() {
  return (
    <div class="max-w-sm space-y-4">
      {(Object.keys(SIZES) as DetailListSize[]).map((size) => (
        <GalleryRow key={size} label={SIZES[size]}>
          <DetailList size={size} rows={ROWS} />
        </GalleryRow>
      ))}
    </div>
  );
}

export const detailListGallery: GalleryEntry = {
  title: "DetailList",
  exports: ["DetailList", "detailListVariants"],
  Demo: DetailListDemo,
};
