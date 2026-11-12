import { clock, PlayButton } from "@impower/impower-ui/components";
import { PLAYBACK_FAILURES, type Sound } from "../../workspace/AudioSession";
import { audioSession, soundPeaks } from "../../workspace/editorAudio";

const sounding = (owner: string) => {
  const playback = audioSession.playback.value;
  return playback?.owner === owner && (playback.status === "playing" || playback.status === "loading");
};

export function SoundPlay({ name, sound }: { name: string; sound: Sound }) {
  return (
    <PlayButton
      name={name}
      playing={sounding(sound.owner)}
      data-asset-play={sound.owner}
      onClick={() => audioSession.toggle(sound)}
    />
  );
}

export function SoundLine({ sound, line }: { sound: Sound; line: string }) {
  const playback = audioSession.playback.value;
  void soundPeaks.settled.value;
  const shape = soundPeaks.peek({ src: sound.src, size: sound.size ?? 0 });
  if (sounding(sound.owner)) {
    const length = playback!.duration ?? (shape?.ok ? shape.duration : null);
    return (
      <span class="tabular-nums" data-asset-sound-time>
        {length === null ? clock(audioSession.time.value) : `${clock(audioSession.time.value)} / ${clock(Math.round(length))}`}
      </span>
    );
  }
  if (playback?.owner === sound.owner && playback.status === "failed") {
    return <span data-asset-sound-failed>{PLAYBACK_FAILURES[playback.failure ?? "unreadable"]}</span>;
  }
  if (shape && !shape.ok) {
    return <span data-asset-sound-failed>{PLAYBACK_FAILURES[shape.failure]}</span>;
  }
  return <>{line}</>;
}
