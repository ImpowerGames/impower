import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import PageFrame, { type PageFrameSize } from "./PageFrame";

const SIZES: Record<PageFrameSize, string> = {
  auto: "Auto: follows data-layout",
  desktop: "Desktop: 40px title, Back to story shown",
  compact: "Compact: 32px title, Back to story hidden",
};

function PageFrameDemo() {
  const [backs, setBacks] = useState(0);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as PageFrameSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}; Back pressed ${backs} times`}>
          <div class="h-[320px] max-w-[760px] overflow-hidden rounded border border-solid border-edge">
            <PageFrame
              size={size}
              eyebrow="Download, Collaborate & Publish"
              title="Share your story"
              line="Export a shareable game or screenplay. Collaborate with others. Publish it online."
              onBack={() => setBacks((count) => count + 1)}
            >
              <p class="m-0 text-body text-muted">Page content</p>
            </PageFrame>
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const pageFrameGallery: GalleryEntry = {
  title: "PageFrame",
  exports: [
    "PageFrame",
    "pageFrameVariants",
    "pageFrameInnerVariants",
    "pageFrameIntroVariants",
    "pageFrameTitleVariants",
    "pageFrameBackVariants",
  ],
  Demo: PageFrameDemo,
};
