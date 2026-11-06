import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Disclosure, { type DisclosureEdge, type DisclosureSize } from "./Disclosure";

const SIZES: Record<DisclosureSize, string> = {
  default: "Default",
};

const EDGES: Record<DisclosureEdge, string> = {
  none: "no edge",
  top: "top edge",
};

function DisclosureDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as DisclosureSize[]).flatMap((size) =>
        (Object.keys(EDGES) as DisclosureEdge[]).map((edge) => (
          <GalleryRow key={`${size}-${edge}`} label={`${SIZES[size]}, ${EDGES[edge]}`}>
            <div class="rounded-[10px] border border-solid border-edge bg-panel">
              <Disclosure size={size} edge={edge} summary="Show details">
                <p class="m-0 pb-3.5 text-xs text-ink">The disclosed content sits under its summary.</p>
              </Disclosure>
            </div>
          </GalleryRow>
        )),
      )}
    </div>
  );
}

export const disclosureGallery: GalleryEntry = {
  title: "Disclosure",
  exports: ["Disclosure", "disclosureVariants", "disclosureSummaryVariants"],
  Demo: DisclosureDemo,
};
