import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { FileIcon, PlayIcon } from "../icon/icons.generated";
import FeatureCard, { type FeatureCardSize } from "./FeatureCard";

const SIZES: Record<FeatureCardSize, string> = {
  default: "Default",
};

function FeatureCardDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as FeatureCardSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: with a tag, and with extra content and no tag`}>
          <div class="grid max-w-[700px] grid-cols-2 gap-5">
            <FeatureCard
              size={size}
              icon={PlayIcon}
              title="Export a game"
              sentence="Package your game for Web, Desktop, or Mobile."
              tag="Coming soon"
            />
            <FeatureCard size={size} icon={FileIcon} title="Export a screenplay" sentence="Print your story to PDF or HTML.">
              <p class="mt-3 mb-0 text-body text-ink">US Letter · Title page · No scene numbers</p>
            </FeatureCard>
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const featureCardGallery: GalleryEntry = {
  title: "FeatureCard",
  exports: ["FeatureCard", "featureCardVariants"],
  Demo: FeatureCardDemo,
};
