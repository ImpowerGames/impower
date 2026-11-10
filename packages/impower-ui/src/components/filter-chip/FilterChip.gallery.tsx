import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import { ErrorIcon, InfoIcon, WarningIcon } from "../icon/icons.generated";
import FilterChip, { type FilterChipSize, type FilterChipTone } from "./FilterChip";

const TONES: Record<FilterChipTone, { word: string; Icon: typeof ErrorIcon }> = {
  error: { word: "error", Icon: ErrorIcon },
  warning: { word: "warning", Icon: WarningIcon },
  info: { word: "note", Icon: InfoIcon },
};

const SIZES: Record<FilterChipSize, string> = {
  default: "Default",
};

function FilterChipDemo() {
  const [pressed, setPressed] = useState<Record<FilterChipTone, boolean>>({
    error: true,
    warning: true,
    info: false,
  });
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as FilterChipSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: each tone, pressed and not pressed (press to toggle)`}>
          <div role="group" aria-label="Show or hide each kind" class="flex flex-wrap gap-0.5">
            {(Object.keys(TONES) as FilterChipTone[]).map((tone) => {
              const { word, Icon } = TONES[tone];
              return (
                <FilterChip
                  key={tone}
                  size={size}
                  tone={tone}
                  icon={<Icon />}
                  pressed={pressed[tone]}
                  onPressedChange={(next) => setPressed((current) => ({ ...current, [tone]: next }))}
                >
                  2 {word}s
                </FilterChip>
              );
            })}
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const filterChipGallery: GalleryEntry = {
  title: "FilterChip",
  exports: ["FilterChip", "filterChipVariants"],
  Demo: FilterChipDemo,
};
