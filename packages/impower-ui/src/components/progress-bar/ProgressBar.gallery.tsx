import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import ProgressBar, { type ProgressBarTone } from "./ProgressBar";

const TONES: ProgressBarTone[] = ["accent", "faded"];

function ProgressBarDemo() {
  return (
    <div class="space-y-4">
      {TONES.map((tone) => (
        <GalleryRow key={tone} label={`${tone}: empty, a third, full and still measuring`}>
          <div class="grid w-[280px] gap-3">
            <ProgressBar tone={tone} value={0} label="Empty" />
            <ProgressBar tone={tone} value={0.33} label="A third" />
            <ProgressBar tone={tone} value={1} label="Full" />
            <ProgressBar tone={tone} label="Measuring" />
          </div>
        </GalleryRow>
      ))}
    </div>
  );
}

export const progressBarGallery: GalleryEntry = {
  title: "ProgressBar",
  exports: ["ProgressBar"],
  Demo: ProgressBarDemo,
};
