import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import VariantsChip, { type VariantsChipSize } from "./VariantsChip";

const SIZES: VariantsChipSize[] = ["default", "compact"];

function VariantsChipDemo() {
  return (
    <div class="space-y-4">
      {SIZES.map((size) => (
        <GalleryRow key={size} label={`${size}: beside a name, at 2, 12 and 1200 variants`}>
          <div class="flex items-center gap-3 text-[14px] text-ink">
            imani
            <VariantsChip size={size} count={2} />
            <VariantsChip size={size} count={12} />
            <VariantsChip size={size} count={1200} />
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const variantsChipGallery: GalleryEntry = {
  title: "VariantsChip",
  exports: ["VariantsChip", "variantsChipVariants", "variantsLabel"],
  Demo: VariantsChipDemo,
};
