import { clock, PlayButton } from "@impower/impower-ui/components";
import { useEffect } from "preact/hooks";
import { addMenuFolders, loopsByDefault } from "../../utils/addMenuFolders";
import { PLAYBACK_FAILURES, type Sound } from "../../workspace/AudioSession";
import { audioSession, soundLengths, soundPeaks } from "../../workspace/editorAudio";
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

const lengthOf = (sound: Sound): number | null => {
  if (sound.size === undefined) {
    return null;
  }
  void soundLengths.settled.value;
  void soundPeaks.settled.value;
  const file = { src: sound.src, size: sound.size };
  const shape = soundPeaks.peek(file);
  return soundLengths.peek(file) ?? (shape?.ok ? shape.duration : null);
};

export function SoundLine({ sound, line }: { sound: Sound; line: string }) {
  useEffect(
    () => (sound.size === undefined ? undefined : soundLengths.request({ src: sound.src, size: sound.size })),
    [sound.src, sound.size],
  );
  const failed = audioSession.failureOf(sound);
  if (failed) {
    return <span data-asset-sound-failed>{PLAYBACK_FAILURES[failed]}</span>;
  }
  const known = lengthOf(sound);
  if (!statusOf(sound.owner)) {
    return <span data-asset-sound-line>{known === null ? line : `${clock(Math.round(known))} · ${line}`}</span>;
  }
  const length = audioSession.playback.value!.duration ?? known;
  const elapsed = clock(audioSession.time.value);
  return (
    <span data-asset-sound-line>
      <span class="tabular-nums" data-asset-sound-time>
        {length === null ? elapsed : `${elapsed} / ${clock(Math.round(length))}`}
      </span>
      {` · ${line}`}
    </span>
  );
}
