import { AudioPlayer, type AudioPlayerState } from "@impower/impower-ui/components";
import { useEffect } from "preact/hooks";
import { addMenuFolders, loopsByDefault } from "../../utils/addMenuFolders";
import type { InspectedAsset } from "../../utils/assetDetails";
import { PLAYBACK_FAILURES, type Sound } from "../../workspace/AudioSession";
import { audioSession, soundPeaks } from "../../workspace/editorAudio";
import { useSettings } from "../../workspace/settings/useSettings";

export const soundOfAsset = (asset: InspectedAsset): Sound | null =>
  asset.src ? { owner: asset.path, src: asset.src, size: asset.link ? undefined : asset.files[0]?.size } : null;

export default function SoundFrame({ asset }: { asset: InspectedAsset }) {
  const { projectSettings } = useSettings();
  const found = soundOfAsset(asset);
  const sound = found ? { ...found, loop: loopsByDefault(asset.path, addMenuFolders(projectSettings)) } : null;
  const file = sound ? { src: sound.src, size: sound.size ?? 0 } : null;
  void soundPeaks.settled.value;
  const shape = file ? soundPeaks.peek(file) : undefined;
  const playback = audioSession.playback.value;
  const mine = !!sound && playback?.owner === sound.owner && playback.src === sound.src ? playback : null;
  const failed = sound ? audioSession.failureOf(sound) : "unreadable";

  useEffect(() => {
    if (file && !failed) {
      void soundPeaks.load(file);
    }
  }, [file?.src, file?.size, failed]);

  const state: AudioPlayerState = failed
    ? "failed"
    : mine?.status === "playing" || mine?.status === "loading"
      ? "playing"
      : mine?.status === "paused"
        ? "paused"
        : !shape
          ? "loading"
          : "ready";

  return (
    <section aria-label={`${asset.name} player`} data-sound-frame>
      <AudioPlayer
        name={asset.name}
        state={state}
        peaks={shape?.ok ? shape.peaks : shape ? null : undefined}
        time={mine ? audioSession.time.value : 0}
        duration={mine?.duration ?? (shape?.ok ? shape.duration : null)}
        failure={failed ? PLAYBACK_FAILURES[failed] : undefined}
        loop={!!sound && audioSession.loops(sound)}
        onToggle={() => sound && audioSession.toggle(sound)}
        onSeek={(seconds) => sound && audioSession.seek(sound, seconds)}
        onRestart={() => sound && audioSession.restart(sound)}
        onLoopChange={(loop) => sound && audioSession.setLoop(sound, loop)}
      />
    </section>
  );
}
