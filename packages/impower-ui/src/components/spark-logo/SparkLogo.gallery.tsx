import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import SparkLogo, { MadeWithSparkSplash } from "./SparkLogo";

function SparkLogoDemo() {
  return (
    <div class="space-y-4">
      {(["md", "sm"] as const).map((size) => (
        <div key={size} class="space-y-4">
          <GalleryRow label={`Lockup (${size})`}>
            <SparkLogo layout="lockup" size={size} />
          </GalleryRow>
          <GalleryRow label={`Mark (${size})`}>
            <SparkLogo layout="mark" size={size} />
          </GalleryRow>
          <GalleryRow label={`Wordmark (${size})`}>
            <SparkLogo layout="wordmark" size={size} />
          </GalleryRow>
        </div>
      ))}
      <GalleryRow label="MadeWithSparkSplash">
        <MadeWithSparkSplash class="max-w-96" />
      </GalleryRow>
    </div>
  );
}

export const sparkLogoGallery: GalleryEntry = {
  title: "SparkLogo",
  exports: ["SparkLogo", "MadeWithSparkSplash"],
  Demo: SparkLogoDemo,
};
