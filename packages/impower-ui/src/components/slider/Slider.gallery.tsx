import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Slider, { type SliderSize, type SliderWidth } from "./Slider";

const SIZES: Record<SliderSize, string> = {
  default: "Default",
};

const WIDTHS: Record<SliderWidth, string> = {
  full: "Full width",
  default: "Default width",
};

function SliderDemo() {
  const [value, setValue] = useState(50);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as SliderSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]} in every width, then disabled`}>
          <div class="grid max-w-md gap-2">
            {(Object.keys(WIDTHS) as SliderWidth[]).map((width) => (
              <Slider key={width} size={size} width={width} aria-label={WIDTHS[width]} defaultValue={40} data-gallery-control />
            ))}
            <Slider size={size} aria-label="Disabled" defaultValue={70} disabled data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`Controlled, 25 to 100 in steps of 5: ${value}`}>
        <div class="max-w-md">
          <Slider
            aria-label="Visible area"
            min={25}
            max={100}
            step={5}
            value={value}
            valueText={(v) => (v === 100 ? "Whole image" : `Top ${v}%`)}
            onValueChange={setValue}
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const sliderGallery: GalleryEntry = {
  title: "Slider",
  exports: ["Slider", "sliderVariants"],
  Demo: SliderDemo,
};
