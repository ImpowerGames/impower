import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ChoiceGroup, { type ChoiceGroupSize, type ChoiceOption } from "./ChoiceGroup";

const SIZES: Record<ChoiceGroupSize, string> = {
  default: "Default",
};

const OPTIONS: readonly ChoiceOption[] = [
  { value: "paper", label: "Paper" },
  { value: "plain", label: "Plain" },
  { value: "none", label: "None" },
];

function ChoiceGroupDemo() {
  const [page, setPage] = useState("paper");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ChoiceGroupSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: rest, disabled`}>
          <div class="flex flex-wrap items-center gap-4">
            <ChoiceGroup size={size} name={`gallery-${size}`} aria-label="Page" options={OPTIONS} defaultValue="plain" data-gallery-control />
            <ChoiceGroup size={size} name={`gallery-${size}-off`} aria-label="Page, disabled" options={OPTIONS} defaultValue="paper" disabled data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`Controlled: ${page}`}>
        <ChoiceGroup name="gallery-controlled" aria-label="Page, controlled" options={OPTIONS} value={page} onValueChange={setPage} />
      </GalleryRow>
    </div>
  );
}

export const choiceGroupGallery: GalleryEntry = {
  title: "ChoiceGroup",
  exports: ["ChoiceGroup", "choiceGroupVariants", "choiceOptionVariants"],
  Demo: ChoiceGroupDemo,
};
