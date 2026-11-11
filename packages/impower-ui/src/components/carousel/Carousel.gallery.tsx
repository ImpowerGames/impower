import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Button from "../button/Button";
import { SettingsIcon } from "../icon/icons.generated";
import Carousel, { type CarouselSize } from "./Carousel";

const SIZES: Record<CarouselSize, string> = {
  fill: "Fill: fills a fixed-height panel, as the Add panel does in the keyboard's space",
  auto: "Auto: as tall as its cards",
};

const CARDS = ["beach", "harbor", "plaza", "market", "station", "garden", "rooftop"];

const Card = ({ name, place }: { name: string; place: string }) => (
  <button type="button" class="flex flex-col items-stretch text-left">
    <span class="min-h-0 flex-1 bg-muted/12" />
    <span class="px-2.5 py-1.5">
      <strong class="block text-[13px]/[1.4] font-semibold">{name}</strong>
      <small class="block text-[12px]/[1.4] text-muted">{place}</small>
    </span>
  </button>
);

function CarouselDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as CarouselSize[]).map((size) => (
        <GalleryRow key={size} label={SIZES[size]}>
          <div class={size === "fill" ? "h-64 w-[390px] bg-panel" : "w-[390px] bg-panel"}>
            <Carousel
              size={size}
              label="Browse backdrops"
              previousLabel="Previous backdrop"
              nextLabel="Next backdrop"
              trailing={
                size === "fill" ? (
                  <Button variant="quiet" size="icon" class="text-muted" aria-label="Portrait thumbnail preferences">
                    <SettingsIcon />
                  </Button>
                ) : undefined
              }
            >
              {CARDS.map((name) => (
                <Card key={name} name={name} place={size === "auto" ? "" : "Places"} />
              ))}
            </Carousel>
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="One card: Previous and Next both disabled">
        <div class="h-48 w-[390px] bg-panel">
          <Carousel label="Browse sounds" previousLabel="Previous sound" nextLabel="Next sound">
            <Card name="door" place="0:02" />
          </Carousel>
        </div>
      </GalleryRow>
    </div>
  );
}

export const carouselGallery: GalleryEntry = {
  title: "Carousel",
  exports: ["Carousel", "carouselVariants", "carouselTrackVariants", "carouselItemVariants"],
  Demo: CarouselDemo,
};
