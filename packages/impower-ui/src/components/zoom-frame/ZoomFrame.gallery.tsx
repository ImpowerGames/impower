import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { SAMPLE_PICTURE } from "../thumbnail/Thumbnail.gallery";
import ZoomFrame, { type ZoomFrameBackdrop, type ZoomFrameSurface } from "./ZoomFrame";

const SHAPE =
  "data:image/svg+xml," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">' +
      '<circle cx="100" cy="100" r="70" fill="#8a5cc4"/>' +
      '<circle cx="100" cy="100" r="30" fill="#f2c26b"/>' +
      "</svg>",
  );

const SURFACES: Record<ZoomFrameSurface, string> = { stage: "Stage", sheet: "Sheet" };
const BACKDROPS: Record<ZoomFrameBackdrop, string> = { none: "no backdrop", checker: "checkerboard behind transparency" };

function ZoomFrameDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SURFACES) as ZoomFrameSurface[]).map((surface) =>
        (Object.keys(BACKDROPS) as ZoomFrameBackdrop[]).map((backdrop) => (
          <GalleryRow key={`${surface}-${backdrop}`} label={`${SURFACES[surface]}, ${BACKDROPS[backdrop]}: zoomable`}>
            <div class="w-80">
              <ZoomFrame label="Zoomable picture" zoomable surface={surface} backdrop={backdrop} ratio={1}>
                <img src={SHAPE} alt="" draggable={false} class="absolute inset-0 size-full object-contain" />
              </ZoomFrame>
            </div>
          </GalleryRow>
        )),
      )}
      <GalleryRow label="Stage, wide picture: zoomable">
        <div class="w-80">
          <ZoomFrame label="Wide picture" zoomable ratio={320 / 200}>
            <img src={SAMPLE_PICTURE} alt="" draggable={false} class="absolute inset-0 size-full object-contain" />
          </ZoomFrame>
        </div>
      </GalleryRow>
      <GalleryRow label="Sheet, a frame for text without zoom">
        <div class="w-80">
          <ZoomFrame label="Notes" surface="sheet">
            <pre class="absolute inset-0 m-0 overflow-auto p-3.5 font-mono text-[13px]/[1.5] whitespace-pre-wrap text-ink">
              {"Harbor scene notes\n\nThe lamps come on one by one."}
            </pre>
          </ZoomFrame>
        </div>
      </GalleryRow>
    </div>
  );
}

export const zoomFrameGallery: GalleryEntry = {
  title: "ZoomFrame",
  exports: ["ZoomFrame", "zoomFrameVariants", "zoomFrameContentVariants"],
  Demo: ZoomFrameDemo,
};
