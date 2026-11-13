import type { LoadAudioPlayerParams } from "../../../modules/audio/types/LoadAudioPlayerParams";
import type { Instructions } from "../../types/Instructions";
import { VOICING_CONTROLS } from "../../utils/voicingControls";
import type { Game } from "../Game";

export interface VoiceEvent {
  after: number;
  queued: boolean;
  clips: LoadAudioPlayerParams[];
}

export function silentVoice(
  game: Game,
  instructions: Instructions,
  instant?: boolean,
): VoiceEvent[] | undefined {
  if (
    instant ||
    game.context.system.previewing === undefined ||
    !instructions.speech
  ) {
    return undefined;
  }
  const events = (instructions.audio?.["voice"] ?? []).flatMap(
    (event): VoiceEvent[] =>
      VOICING_CONTROLS.has(event.control) && event.assets?.length
        ? [
            {
              after: event.after ?? 0,
              queued: event.control === "queue",
              clips: game.module.audio.resolveLoadParams("voice", event.assets),
            },
          ]
        : [],
  );
  return events.length > 0 ? events : undefined;
}

export function voiceSpans(
  events: VoiceEvent[],
  lengthOf: (key: string) => number | undefined,
): [number, number][] {
  const spans: [number, number][] = [];
  let end = 0;
  for (const event of events) {
    const start = event.queued ? end + event.after : event.after;
    for (const clip of event.clips) {
      const length = lengthOf(clip.key);
      if (length == null || length <= 0) {
        continue;
      }
      spans.push([start, start + length]);
      end = Math.max(end, start + length);
    }
  }
  return spans;
}
