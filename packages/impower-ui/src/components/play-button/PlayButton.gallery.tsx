import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import PlayButton, { type PlayButtonRing, type PlayButtonSize } from "./PlayButton";

const SIZES: Record<PlayButtonSize, string> = {
  row: "Row",
  strip: "Strip",
  large: "Large",
};

const RINGS: Record<PlayButtonRing, string> = {
  edge: "edge ring",
  accent: "accent ring",
};

function PlayButtonDemo() {
  const [playing, setPlaying] = useState(false);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as PlayButtonSize[]).flatMap((size) =>
        (Object.keys(RINGS) as PlayButtonRing[]).map((ring) => (
          <GalleryRow
            key={`${size}-${ring}`}
            label={`${SIZES[size]}, ${RINGS[ring]}: Play, Pause while playing, disabled`}
          >
            <div class="flex items-center gap-3">
              <PlayButton size={size} ring={ring} name="door" data-gallery-control />
              <PlayButton size={size} ring={ring} name="door" playing data-gallery-control />
              <PlayButton size={size} ring={ring} name="door" disabled data-gallery-control />
            </div>
          </GalleryRow>
        )),
      )}
      <GalleryRow label={playing ? "Pressed: playing, press to pause" : "Press to play"}>
        <PlayButton name="rain" playing={playing} onClick={() => setPlaying(!playing)} />
      </GalleryRow>
    </div>
  );
}

export const playButtonGallery: GalleryEntry = {
  title: "Play button",
  exports: ["PlayButton", "playButtonVariants"],
  Demo: PlayButtonDemo,
};
