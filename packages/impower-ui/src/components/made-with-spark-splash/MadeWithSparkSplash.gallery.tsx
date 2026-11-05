import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import MadeWithSparkSplash from "./MadeWithSparkSplash";

function MadeWithSparkSplashDemo() {
  return (
    <GalleryRow label="Default (plays once on mount)">
      <MadeWithSparkSplash class="max-w-96" />
    </GalleryRow>
  );
}

export const madeWithSparkSplashGallery: GalleryEntry = {
  title: "MadeWithSparkSplash",
  exports: ["MadeWithSparkSplash"],
  Demo: MadeWithSparkSplashDemo,
};
