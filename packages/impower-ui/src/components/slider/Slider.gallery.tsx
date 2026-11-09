import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import type { JSX } from "preact";
import Slider, { type SliderSize, type SliderTrack, type SliderWidth } from "./Slider";

const SIZES: Record<SliderSize, string> = {
  default: "Default",
};

const WIDTHS: Record<SliderWidth, string> = {
  full: "Full width",
  default: "Default width",
};

const TRACKS: Record<SliderTrack, string> = {
  default: "Default track",
  opacity: "Opacity track",
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
      <GalleryRow label="Every track">
        <div class="grid max-w-md gap-2">
          {(Object.keys(TRACKS) as SliderTrack[]).map((track) => (
            <Slider
              key={track}
              track={track}
              aria-label={TRACKS[track]}
              defaultValue={50}
              style={{ "--swatch": "#ff8800" } as JSX.CSSProperties}
              data-gallery-control
            />
          ))}
        </div>
      </GalleryRow>
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
