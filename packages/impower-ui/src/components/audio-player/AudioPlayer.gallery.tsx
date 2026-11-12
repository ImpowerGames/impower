import { useState } from "preact/hooks";
import { GalleryRow, type GalleryEntry } from "../../gallery/GallerySection";
import AudioPlayer, { type AudioPlayerState } from "./AudioPlayer";

const PEAKS = Array.from({ length: 200 }, (_, index) =>
  Math.round(Math.abs(Math.sin(index / 7) * Math.cos(index / 23)) * 100),
);

const STATES: Record<AudioPlayerState, string> = {
  loading: "Loading",
  ready: "Ready",
  playing: "Playing",
  failed: "Failed",
};

const ignore = () => undefined;

function AudioPlayerDemo() {
  const [time, setTime] = useState(24);
  const [playing, setPlaying] = useState(false);
  return (
    <div class="space-y-4">
      {(Object.keys(STATES) as AudioPlayerState[]).map((state) => (
        <GalleryRow key={state} label={STATES[state]}>
          <div class="max-w-md">
            <AudioPlayer
              name="rain"
              state={state}
              peaks={state === "loading" || state === "failed" ? undefined : PEAKS}
              time={state === "ready" ? 0 : 24}
              duration={state === "loading" ? null : 96}
              failure="Can't play this file here."
              onToggle={ignore}
              onSeek={ignore}
            />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Ready, cued part way, without a waveform">
        <div class="max-w-md">
          <AudioPlayer name="door" state="ready" peaks={null} time={3} duration={8} onToggle={ignore} onSeek={ignore} />
        </div>
      </GalleryRow>
      <GalleryRow label={`Interactive: ${playing ? "playing" : "stopped"} at ${Math.floor(time)}s`}>
        <div class="max-w-md">
          <AudioPlayer
            name="theme"
            state={playing ? "playing" : "ready"}
            peaks={PEAKS}
            time={time}
            duration={96}
            onToggle={() => {
              setPlaying(!playing);
              if (playing) setTime(0);
            }}
            onSeek={setTime}
          />
        </div>
      </GalleryRow>
    </div>
  );
}

export const audioPlayerGallery: GalleryEntry = {
  title: "Audio player",
  exports: ["AudioPlayer", "audioPlayerVariants", "audioWaveVariants", "clock"],
  Demo: AudioPlayerDemo,
};
