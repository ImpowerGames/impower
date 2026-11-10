import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import Thumbnail from "../thumbnail/Thumbnail";
import VariantsBadge, { type VariantsBadgeSize } from "./VariantsBadge";

const SIZES: VariantsBadgeSize[] = ["default", "compact"];

function VariantsBadgeDemo() {
  return (
    <div class="space-y-4">
      {SIZES.map((size) => (
        <GalleryRow key={size} label={`${size}: in a thumbnail's corner, at 4 and 1200 variants`}>
          <div class="flex gap-4">
            {[4, 1200].map((count) => (
              <span key={count} class="relative block h-24 w-36 overflow-hidden rounded-[9px]">
                <Thumbnail size="fill" src={SAMPLE_PICTURE} />
                <VariantsBadge size={size} count={count} class="absolute right-1.5 bottom-1.5" />
              </span>
            ))}
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const variantsBadgeGallery: GalleryEntry = {
  title: "VariantsBadge",
  exports: ["VariantsBadge", "variantsBadgeVariants"],
  Demo: VariantsBadgeDemo,
};
