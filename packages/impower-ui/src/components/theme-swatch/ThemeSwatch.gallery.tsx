import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ThemeSwatch, { type ThemeSwatchSize } from "./ThemeSwatch";

const SIZES: Record<ThemeSwatchSize, string> = {
  default: "Default",
};

const THEMES = ["charcoal", "chalk", "ink", "paper", "graphite", "warm", "midnight", "dusk"] as const;

function ThemeSwatchDemo() {
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as ThemeSwatchSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: one theme each, and a pair`}>
          <div class="grid grid-cols-[repeat(auto-fill,minmax(140px,1fr))] gap-3">
            <ThemeSwatch size={size} theme="charcoal" pairedTheme="chalk" />
            {THEMES.map((theme) => (
              <ThemeSwatch key={theme} size={size} theme={theme} />
            ))}
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const themeSwatchGallery: GalleryEntry = {
  title: "ThemeSwatch",
  exports: ["ThemeSwatch", "themeSwatchVariants"],
  Demo: ThemeSwatchDemo,
};
