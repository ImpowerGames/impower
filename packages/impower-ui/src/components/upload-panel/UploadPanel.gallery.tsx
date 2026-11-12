import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import UploadPanel, { type UploadPanelRow } from "./UploadPanel";

const ROWS: UploadPanelRow[] = [
  { key: "1", name: "forest_morning.png", note: "Added to Backdrops", state: "added" },
  { key: "2", name: "theme_song_with_a_very_long_name_that_fades_out.ogg", note: "Adding", state: "working" },
  { key: "3", name: "rain.ogg", note: "Waiting", state: "waiting" },
  {
    key: "4",
    name: "huge_video.mp4",
    note: "Not added: this browser has no room left for it, so free some space and try again.",
    state: "failed",
  },
];

function UploadPanelDemo() {
  return (
    <div class="space-y-4">
      <GalleryRow label="uploading, with each row state">
        <div class="w-[420px]">
          <UploadPanel heading="Uploading 3 of 4" rows={ROWS} onClose={() => {}} />
        </div>
      </GalleryRow>
      <GalleryRow label="finished with one not added, at a narrow width">
        <div class="w-[320px]">
          <UploadPanel
            heading="3 files added, 1 not added"
            rows={ROWS.map((row) => (row.state === "failed" ? row : { ...row, state: "added", note: "Added to Audio" }))}
            onClose={() => {}}
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const uploadPanelGallery: GalleryEntry = {
  title: "UploadPanel",
  exports: ["UploadPanel"],
  Demo: UploadPanelDemo,
};
