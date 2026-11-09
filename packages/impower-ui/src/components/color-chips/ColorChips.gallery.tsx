import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ColorChips, { type ColorChipSize } from "./ColorChips";

const SIZES: Record<ColorChipSize, string> = {
  default: "Default",
};

const STORY = [
  "#f2c14e",
  "#f78154",
  "#4d9078",
  "#b4436c",
  "#5fad56",
  "#1d3557",
  "#ffffff",
  "#000000",
];

function ColorChipsDemo() {
  const [current, setCurrent] = useState(STORY[0]);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ColorChipSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: the current color marked (${current})`}>
          <ColorChips
            size={size}
            label="Colors in this story"
            colors={STORY}
            current={current}
            onSelect={setCurrent}
          />
        </GalleryRow>
      ))}
    </div>
  );
}

export const colorChipsGallery: GalleryEntry = {
  title: "ColorChips",
  exports: ["ColorChips", "colorChipVariants"],
  Demo: ColorChipsDemo,
};
