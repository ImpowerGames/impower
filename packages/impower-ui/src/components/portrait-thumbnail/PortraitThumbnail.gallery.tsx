import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import PortraitThumbnail, { portraitCropLabel, type PortraitThumbnailSize } from "./PortraitThumbnail";

export const SAMPLE_PORTRAIT =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="300" height="600" viewBox="0 0 300 600">' +
      '<rect width="300" height="600" fill="none"/>' +
      '<circle cx="150" cy="120" r="70" fill="#c98f6b"/>' +
      '<path d="M80 110 Q150 20 220 110 L220 90 Q150 0 80 90Z" fill="#3b2a20"/>' +
      '<path d="M40 600 L50 300 Q150 200 250 300 L260 600Z" fill="#4f6d8f"/>' +
      '<rect x="125" y="185" width="50" height="40" fill="#c98f6b"/>' +
      "</svg>",
  );

const SIZES: Record<PortraitThumbnailSize, string> = {
  tile: "Tile",
  example: "Example",
  fill: "Fill",
};

const CROPS = [25, 50, 75, 100] as const;

function PortraitThumbnailDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as PortraitThumbnailSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]} at ${CROPS.map(portraitCropLabel).join(", ")}`}>
          <div class="grid grid-cols-4 items-center gap-4">
            {CROPS.map((crop) => (
              <div key={crop} class={size === "fill" ? "h-32 w-24" : "w-36"}>
                <PortraitThumbnail size={size} src={SAMPLE_PORTRAIT} crop={crop} alt={portraitCropLabel(crop)} />
              </div>
            ))}
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const portraitThumbnailGallery: GalleryEntry = {
  title: "PortraitThumbnail",
  exports: ["PortraitThumbnail", "portraitThumbnailVariants"],
  Demo: PortraitThumbnailDemo,
};
