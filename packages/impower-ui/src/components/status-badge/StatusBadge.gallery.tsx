import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import StatusBadge, { type StatusBadgeTone } from "./StatusBadge";

const TONES: Record<StatusBadgeTone, { label: string; text: string }> = {
  default: { label: "Default", text: "End of story" },
  error: { label: "Error", text: "Stopped by an error" },
};

const THEMES = ["charcoal", "chalk"] as const;

function StatusBadgeDemo() {
  return (
    <div class="grid gap-4 lg:grid-cols-2">
      {THEMES.map((theme) => (
        <div
          key={theme}
          data-theme={theme}
          class="space-y-3 rounded-card bg-stage p-4 text-ink"
        >
          {(Object.keys(TONES) as StatusBadgeTone[]).map((tone) => (
            <GalleryRow key={tone} label={`${TONES[tone].label}, ${theme}`}>
              <StatusBadge tone={tone}>{TONES[tone].text}</StatusBadge>
            </GalleryRow>
          ))}
        </div>
      ))}
    </div>
  );
}

export const statusBadgeGallery: GalleryEntry = {
  title: "StatusBadge",
  exports: ["StatusBadge", "statusBadgeVariants"],
  Demo: StatusBadgeDemo,
};
