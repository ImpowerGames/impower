import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import CaretColorChip from "./CaretColorChip";

const VALUES = [
  { label: "Hex value", color: "#ff8800", value: "#ff8800" },
  { label: "Translucent value", color: "rgb(51 102 204 / 0.5)", value: "#3366cc80" },
  { label: "Light value", color: "#f4f1ea", value: "#f4f1ea" },
] as const;

const THEMES = ["charcoal", "chalk"] as const;

function CaretColorChipDemo() {
  const [opened, setOpened] = useState(0);
  return (
    <div class="grid gap-4 lg:grid-cols-2">
      {THEMES.map((theme) => (
        <div key={theme} data-theme={theme} class="space-y-3 rounded-card bg-paper p-4 text-ink">
          {VALUES.map((entry) => (
            <GalleryRow key={entry.label} label={`${entry.label}, ${theme}`}>
              <CaretColorChip
                color={entry.color}
                value={entry.value}
                onClick={() => setOpened((count) => count + 1)}
              />
            </GalleryRow>
          ))}
          <GalleryRow label={`Long value in a narrow bar, ${theme}`}>
            <div class="flex w-[120px]">
              <CaretColorChip color="rgb(255 136 0)" value="rgb(255, 136, 0)" />
            </div>
          </GalleryRow>
        </div>
      ))}
      <p class="text-[12px] text-muted">Opened {opened} times</p>
    </div>
  );
}

export const caretColorChipGallery: GalleryEntry = {
  title: "CaretColorChip",
  exports: ["CaretColorChip", "caretColorChipVariants"],
  Demo: CaretColorChipDemo,
};
