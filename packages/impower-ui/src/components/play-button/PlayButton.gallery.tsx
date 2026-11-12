import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import PlayButton, { type PlayButtonSize } from "./PlayButton";

const SIZES: Record<PlayButtonSize, string> = {
  row: "Row",
  large: "Large",
};

function PlayButtonDemo() {
  const [playing, setPlaying] = useState(false);
  return (
    <div class="space-y-4">
      {(Object.keys(SIZES) as PlayButtonSize[]).map((size) => (
        <GalleryRow key={size} label={`${SIZES[size]}: stopped, playing, disabled`}>
          <div class="flex items-center gap-3">
            <PlayButton size={size} name="door" data-gallery-control />
            <PlayButton size={size} name="door" playing data-gallery-control />
            <PlayButton size={size} name="door" disabled data-gallery-control />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label={playing ? "Pressed: playing" : "Press to play"}>
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
