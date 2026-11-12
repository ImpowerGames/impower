import { clock, PlayButton } from "@impower/impower-ui/components";
import { addMenuFolders, loopsByDefault } from "../../utils/addMenuFolders";
import { PLAYBACK_FAILURES, type Sound } from "../../workspace/AudioSession";
import { audioSession, soundPeaks } from "../../workspace/editorAudio";
import { useSettings } from "../../workspace/settings/useSettings";

const statusOf = (owner: string) => {
  const playback = audioSession.playback.value;
  return playback?.owner === owner ? playback.status : null;
};

const sounding = (owner: string) => {
  const status = statusOf(owner);
  return status === "playing" || status === "loading";
};

export function SoundPlay({ name, sound }: { name: string; sound: Sound }) {
  const { projectSettings } = useSettings();
  const loop = loopsByDefault(sound.owner, addMenuFolders(projectSettings));
  return (
    <PlayButton
      name={name}
      playing={sounding(sound.owner)}
      data-asset-play={sound.owner}
      onClick={() => audioSession.toggle({ ...sound, loop })}
    />
  );
}

export function SoundLine({ sound, line }: { sound: Sound; line: string }) {
  const failed = audioSession.failureOf(sound);
  if (failed) {
    return <span data-asset-sound-failed>{PLAYBACK_FAILURES[failed]}</span>;
  }
  if (!sounding(sound.owner) && statusOf(sound.owner) !== "paused") {
    return <>{line}</>;
  }
  void soundPeaks.settled.value;
  const shape = soundPeaks.peek({ src: sound.src, size: sound.size ?? 0 });
  const length = audioSession.playback.value!.duration ?? (shape?.ok ? shape.duration : null);
  const elapsed = clock(audioSession.time.value);
  return (
    <span class="tabular-nums" data-asset-sound-time>
      {length === null ? elapsed : `${elapsed} / ${clock(Math.round(length))}`}
    </span>
  );
}
