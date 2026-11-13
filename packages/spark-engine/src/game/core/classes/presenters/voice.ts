import type { AudioPlayerUpdate } from "../../../modules/audio/types/AudioPlayerUpdate";
import type { LoadAudioPlayerParams } from "../../../modules/audio/types/LoadAudioPlayerParams";
import type { Instructions } from "../../types/Instructions";
import type { Game } from "../Game";

const STOP_FADE_SECONDS = 0.016;

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
  const instances: { key: string; from: number; natural: number; ends: number }[] =
    [];
  let origin = 0;
  const apply = (update: AudioPlayerUpdate, key: string) => {
    const when = origin + (update.after ?? 0);
    if (update.control === "start") {
      const clip = clips.get(key);
      const length = clip ? lengthOf(clip) : undefined;
      if (length != null && length > 0) {
        instances.push({ key, from: when, natural: when + length, ends: when + length });
      }
    } else if (update.control === "stop") {
      const disconnects = when + (update.over ?? STOP_FADE_SECONDS);
      for (const instance of instances) {
        if (instance.key === key && instance.ends > when) {
          instance.ends = Math.min(instance.natural, disconnects);
        }
      }
    }
  };
  for (const update of voice.updates) {
    if (update.key) {
      apply(update, update.key);
      continue;
    }
    for (const key of new Set(instances.map((instance) => instance.key))) {
      apply(update, key);
    }
    if (update.control === "await" && instances.length > 0) {
      origin = Math.max(origin, ...instances.map((instance) => instance.ends));
    }
  }
  return instances
    .filter((instance) => instance.ends > instance.from)
    .map(({ from, ends }): [number, number] => [from, ends]);
}
