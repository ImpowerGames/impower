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
  paused: "Paused part way",
  failed: "Failed",
};

const ignore = () => undefined;

function AudioPlayerDemo() {
  const [time, setTime] = useState(24);
  const [playing, setPlaying] = useState(false);
  const [loop, setLoop] = useState(true);
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
              loop={false}
              onToggle={ignore}
              onSeek={ignore}
              onRestart={ignore}
              onLoopChange={ignore}
            />
          </div>
        </GalleryRow>
      ))}
      <GalleryRow label="Playing with Loop on">
        <div class="max-w-md">
          <AudioPlayer
            name="theme"
            state="playing"
            peaks={PEAKS}
            time={60}
            duration={96}
            loop
            onToggle={ignore}
            onSeek={ignore}
            onRestart={ignore}
            onLoopChange={ignore}
          />
        </div>
      </GalleryRow>
      <GalleryRow label="Ready, cued part way, without a waveform">
        <div class="max-w-md">
          <AudioPlayer
            name="door"
            state="ready"
            peaks={null}
            time={3}
            duration={8}
            loop={false}
            onToggle={ignore}
            onSeek={ignore}
            onRestart={ignore}
            onLoopChange={ignore}
          />
        </div>
      </GalleryRow>
      <GalleryRow
        label={`Interactive: ${playing ? "playing" : "paused"} at ${Math.floor(time)}s, Loop ${loop ? "on" : "off"}`}
      >
        <div class="max-w-md">
          <AudioPlayer
            name="theme"
            state={playing ? "playing" : "paused"}
            peaks={PEAKS}
            time={time}
            duration={96}
            loop={loop}
            onToggle={() => setPlaying(!playing)}
            onSeek={setTime}
            onRestart={() => setTime(0)}
            onLoopChange={setLoop}
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
