import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ThemeSwatch from "../theme-swatch/ThemeSwatch";
import ChoiceGroup, { type ChoiceGroupFill, type ChoiceGroupSize, type ChoiceOption } from "./ChoiceGroup";

const SIZES: Record<ChoiceGroupSize, string> = {
  default: "Default",
  small: "Small",
};

const FILLS: Record<ChoiceGroupFill, string> = {
  elevated: "raised fill",
  tint: "tint fill",
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
      {(Object.keys(SIZES) as ChoiceGroupSize[]).flatMap((size) =>
        (Object.keys(FILLS) as ChoiceGroupFill[]).map((fill) => (
          <GalleryRow key={`${size}-${fill}`} label={`Segmented, ${SIZES[size]}, ${FILLS[fill]}: rest, disabled`}>
            <div class="flex flex-wrap items-center gap-4">
              <ChoiceGroup size={size} fill={fill} name={`gallery-${size}-${fill}`} aria-label="Page" options={OPTIONS} defaultValue="plain" data-gallery-control />
              <ChoiceGroup size={size} fill={fill} name={`gallery-${size}-${fill}-off`} aria-label="Page, disabled" options={OPTIONS} defaultValue="paper" disabled data-gallery-control />
            </div>
          </GalleryRow>
        )),
      )}
      <GalleryRow label={`Controlled: ${page}`}>
        <ChoiceGroup name="gallery-controlled" aria-label="Page, controlled" options={OPTIONS} value={page} onValueChange={setPage} />
      </GalleryRow>
      <GalleryRow label={`Tiles: ${tile}, one disabled`}>
        <div>
          <ChoiceGroup variant="tiles" name="gallery-tiles" aria-label="Theme" options={TILES} value={tile} onValueChange={setTile} />
        </div>
      </GalleryRow>
    </div>
  );
}

export const choiceGroupGallery: GalleryEntry = {
  title: "ChoiceGroup",
  exports: ["ChoiceGroup", "choiceGroupVariants", "choiceOptionVariants"],
  Demo: ChoiceGroupDemo,
};
