import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { VolumeIcon } from "../icon/icons.generated";
import Thumbnail, { type ThumbnailFit, type ThumbnailSize } from "./Thumbnail";

export const SAMPLE_PICTURE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="200" viewBox="0 0 320 200">' +
      '<rect width="320" height="200" fill="#4f6d8f"/>' +
      '<rect y="130" width="320" height="70" fill="#3b2a20"/>' +
      '<circle cx="250" cy="55" r="28" fill="#f2c26b"/>' +
      "</svg>",
  );

const SIZES: Record<ThumbnailSize, string> = { row: "Row", card: "Card", fill: "Fill" };
const FITS: ThumbnailFit[] = ["cover", "contain", "top", "height"];

function ThumbnailDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ThumbnailSize[]).map((size) => (
        <GalleryRow
          key={size}
          label={`${SIZES[size]}: ${FITS.join(", ")}, a picture that fails to decode, then a sound's glyph`}
        >
          <div class="flex items-center gap-4">
            {FITS.map((fit) => (
              <div key={fit} class={size === "fill" ? "h-24 w-20" : ""}>
                <Thumbnail size={size} fit={fit} src={SAMPLE_PICTURE} alt={fit} />
              </div>
            ))}
            <div class={size === "fill" ? "h-24 w-20" : ""}>
              <Thumbnail size={size} src="data:image/png;base64,AAAA" alt="Broken" />
            </div>
            <div class={size === "fill" ? "h-24 w-20" : ""}>
              <Thumbnail size={size} glyph={<VolumeIcon />} />
            </div>
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const thumbnailGallery: GalleryEntry = {
  title: "Thumbnail",
  exports: ["Thumbnail", "thumbnailVariants", "thumbnailImageVariants"],
  Demo: ThumbnailDemo,
};
