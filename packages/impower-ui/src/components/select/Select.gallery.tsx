import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import Select, { type SelectOption, type SelectSize } from "./Select";

const SIZES: Record<SelectSize, string> = {
  default: "Default",
};

const OPTIONS: readonly SelectOption[] = [
  { value: "usletter", label: "US Letter" },
  { value: "a4", label: "A4" },
  { value: "legal", label: "Legal", disabled: true },
];

function SelectDemo() {
  const [paper, setPaper] = useState("usletter");
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as SelectSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: rest, disabled`}>
          <div class="flex items-center gap-4">
            <Select size={size} aria-label="Paper" options={OPTIONS} defaultValue="a4" data-gallery-control />
            <Select size={size} aria-label="Paper, disabled" options={OPTIONS} defaultValue="usletter" disabled data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={`Controlled: ${paper}`}>
        <Select aria-label="Paper, controlled" options={OPTIONS} value={paper} onValueChange={setPaper} />
      </GalleryRow>
    </div>
  );
}

export const selectGallery: GalleryEntry = {
  title: "Select",
  exports: ["Select", "selectVariants"],
  Demo: SelectDemo,
};
