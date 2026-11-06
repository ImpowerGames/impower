import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ThemeSwatch from "../theme-swatch/ThemeSwatch";
import ChoiceGroup, { type ChoiceGroupSize, type ChoiceOption } from "./ChoiceGroup";

const SIZES: Record<ChoiceGroupSize, string> = {
  default: "Default",
};

const OPTIONS: readonly ChoiceOption[] = [
  { value: "paper", label: "Paper" },
  { value: "plain", label: "Plain" },
  { value: "none", label: "None" },
];

const TILES: readonly ChoiceOption[] = [
  { value: "automatic", label: "Automatic", detail: "Follows the device", media: <ThemeSwatch theme="charcoal" pairedTheme="chalk" /> },
  { value: "charcoal", label: "Charcoal", detail: "Neutral grey", media: <ThemeSwatch theme="charcoal" /> },
  { value: "chalk", label: "Chalk", detail: "Neutral white", media: <ThemeSwatch theme="chalk" /> },
  { value: "midnight", label: "Midnight", detail: "Original colors", media: <ThemeSwatch theme="midnight" />, disabled: true },
];

function ChoiceGroupDemo() {
  const [page, setPage] = useState("paper");
  const [tile, setTile] = useState("charcoal");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ChoiceGroupSize[]).map((size) => (
        <GalleryRow key={size} label={`Segmented, ${SIZES[size]}: rest, disabled`}>
          <div class="flex flex-wrap items-center gap-4">
            <ChoiceGroup size={size} name={`gallery-${size}`} aria-label="Page" options={OPTIONS} defaultValue="plain" data-gallery-control />
            <ChoiceGroup size={size} name={`gallery-${size}-off`} aria-label="Page, disabled" options={OPTIONS} defaultValue="paper" disabled data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`Controlled: ${page}`}>
        <ChoiceGroup name="gallery-controlled" aria-label="Page, controlled" options={OPTIONS} value={page} onValueChange={setPage} />
      </GalleryRow>
      {(Object.keys(SIZES) as ChoiceGroupSize[]).map((size) => (
        <GalleryRow key={`tiles-${size}`} label={`Tiles, ${SIZES[size]}: ${tile}, one disabled`}>
          <div>
            <ChoiceGroup variant="tiles" size={size} name={`gallery-tiles-${size}`} aria-label="Theme" options={TILES} value={tile} onValueChange={setTile} />
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const choiceGroupGallery: GalleryEntry = {
  title: "ChoiceGroup",
  exports: ["ChoiceGroup", "choiceGroupVariants", "choiceOptionVariants"],
  Demo: ChoiceGroupDemo,
};
