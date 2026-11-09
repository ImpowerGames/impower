import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ColorWell, { type ColorWellSize } from "./ColorWell";

const SIZES: Record<ColorWellSize, string> = {
  default: "Default",
};

function ColorWellDemo() {
  const [value, setValue] = useState("#f2c14e");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ColorWellSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: light, dark, disabled`}>
          <div class="flex items-center gap-4">
            <ColorWell size={size} value="#f2c14e" label="Light" />
            <ColorWell size={size} value="#1d3557" label="Dark" />
            <ColorWell size={size} value="#888888" label="Disabled" disabled />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`Controlled: ${value}`}>
        <ColorWell value={value} label="Pick any color" onValueChange={setValue} />
      </GalleryRow>
    </div>
  );
}

export const colorWellGallery: GalleryEntry = {
  title: "ColorWell",
  exports: ["ColorWell", "colorWellVariants"],
  Demo: ColorWellDemo,
};
