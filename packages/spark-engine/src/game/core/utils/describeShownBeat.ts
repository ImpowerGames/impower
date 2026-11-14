import { stripStyleCodes } from "@impower/sparkdown/src/runtime/displayStyle";
import type { Instructions } from "../types/Instructions";
import type { ShownBeatDescription } from "../types/ShownBeatDescription";

const CUE_TARGETS = new Set(["character_name", "character_parenthetical"]);

const plain = (text: string) => stripStyleCodes(text).replace(/\s+/g, " ").trim();

export const describeShownBeat = (beat: Instructions): ShownBeatDescription => {
  const words = Object.entries(beat.text ?? {})
    .filter(([target]) => !CUE_TARGETS.has(target) && !target.startsWith("choice "))
    .map(([, events]) => events.map((event) => event.text ?? "").join(""))
    .join(" ");
  const options = (beat.options ?? []).map(plain);
  return {
    kind: beat.kind ?? null,
    ...(beat.speaker?.name ? { speaker: plain(beat.speaker.name) } : {}),
    words: plain(words),
    ...(options.length ? { options } : {}),
  };
};
