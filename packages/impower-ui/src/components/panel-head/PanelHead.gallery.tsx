import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { BackIcon, ChevronIcon, ChevronLeftIcon, CloseIcon } from "../icon/icons.generated";
import PanelHead, { type PanelHeadSize, type PanelHeadTitleSize } from "./PanelHead";

const SIZES: Record<PanelHeadSize, string> = {
  compact: "Compact, 44px",
  default: "Default, 52px",
  tall: "Tall, 68px",
};

const TITLE_SIZES: Record<PanelHeadTitleSize, string> = { sm: "14px title", md: "15px title" };

const close = (
  <Button variant="quiet" size="icon" class="text-muted" aria-label="Close details">
    <CloseIcon />
  </Button>
);

const steps = (
  <div role="group" aria-label="Previous and next" class="flex flex-none">
    <Button variant="quiet" size="icon" class="w-10 text-muted" aria-label="No previous item" disabled>
      <ChevronLeftIcon />
    </Button>
    <Button variant="quiet" size="icon" class="w-10 text-muted" aria-label="Next: market">
      <ChevronIcon />
    </Button>
  </div>
);

function PanelHeadDemo() {
  return (
    <div class="max-w-md space-y-4">
      {(Object.keys(SIZES) as PanelHeadSize[]).map((size) =>
        (Object.keys(TITLE_SIZES) as PanelHeadTitleSize[]).map((titleSize) => (
          <GalleryRow key={`${size}-${titleSize}`} label={`${SIZES[size]}, ${TITLE_SIZES[titleSize]}, with an edge`}>
            <div class="bg-panel">
              <PanelHead size={size} titleSize={titleSize} title="harbor" subtitle="Image · PNG" start={close} end={steps} />
            </div>
          </GalleryRow>
        )),
      )}
      <GalleryRow label="Without an edge, Back at the start and no subtitle">
        <div class="bg-panel">
          <PanelHead
            edge={false}
            title="Writing tools"
            start={
              <Button variant="quiet" size="icon" class="text-muted" aria-label="Back to writing tools">
                <BackIcon />
              </Button>
            }
            end={close}
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const panelHeadGallery: GalleryEntry = {
  title: "PanelHead",
  exports: ["PanelHead", "panelHeadVariants"],
  Demo: PanelHeadDemo,
};
