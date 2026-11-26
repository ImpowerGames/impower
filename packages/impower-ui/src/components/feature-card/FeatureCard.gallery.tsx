import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { FileIcon, PeopleIcon, PlayIcon } from "../icon/icons.generated";
import FeatureCard from "./FeatureCard";

function FeatureCardDemo() {
  return (
    <div class="space-y-4">
      <GalleryRow label="Card: glyph, title and sentence, with extra content below">
        <div class="max-w-[600px]">
          <FeatureCard icon={FileIcon} title="Export a screenplay" sentence="Print your story to PDF or HTML.">
            <p class="mt-3 mb-0 text-body text-ink">US Letter · Title page · No scene numbers</p>
          </FeatureCard>
        </div>
      </GalleryRow>
      <GalleryRow label="Row: glyph beside title and sentence, no action">
        <div class="flex max-w-[600px] flex-col gap-2.5">
          <FeatureCard
            layout="row"
            icon={PlayIcon}
            title="Export a game"
            sentence="Package your game for Web, Desktop, or Mobile."
          />
          <FeatureCard
            layout="row"
            icon={PeopleIcon}
            title="Make it together"
            sentence="Invite someone to collaborate with you."
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const featureCardGallery: GalleryEntry = {
  title: "FeatureCard",
  exports: ["FeatureCard", "featureCardVariants"],
  Demo: FeatureCardDemo,
};
