import type { AudioPlayerUpdate } from "../../../modules/audio/types/AudioPlayerUpdate";
import type { LoadAudioPlayerParams } from "../../../modules/audio/types/LoadAudioPlayerParams";
import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";

export interface SilentVoice {
  updates: AudioPlayerUpdate[];
  clips: LoadAudioPlayerParams[];
}

export function silentVoice(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
): SilentVoice | undefined {
  const sequence = instructions.audio?.["voice"];
  if (
    instant ||
    game.context.system.previewing === undefined ||
    !instructions.speech ||
    !sequence?.length
  ) {
    return undefined;
  }
  const voice = game.module.audio.planVoice(sequence);
  return voice.clips.length > 0 ? voice : undefined;
}

export function voiceSpans(
  voice: SilentVoice,
  lengthOf: (clip: LoadAudioPlayerParams) => number | undefined,
): [number, number][] {
  const clips = new Map(voice.clips.map((clip) => [clip.key, clip]));
  const heard: { key: string; from: number; to: number }[] = [];
  let origin = 0;
  const apply = (update: AudioPlayerUpdate, key: string) => {
    const when = origin + (update.after ?? 0);
    if (update.control === "start") {
      const clip = clips.get(key);
      const length = clip ? lengthOf(clip) : undefined;
      if (length != null && length > 0) {
        heard.push({ key, from: when, to: when + length });
      }
    } else if (update.control === "stop") {
      for (const instance of heard) {
        if (instance.key === key && instance.to > when) {
          instance.to = Math.max(instance.from, when);
        }
      }
    }
  };
  for (const update of voice.updates) {
    if (update.key) {
      apply(update, update.key);
      continue;
    }
    for (const key of new Set(heard.map((instance) => instance.key))) {
      apply(update, key);
    }
    if (update.control === "await" && heard.length > 0) {
      origin = Math.max(origin, ...heard.map((instance) => instance.to));
    }
  }
  return heard
    .filter((instance) => instance.to > instance.from)
    .map(({ from, to }): [number, number] => [from, to]);
}
