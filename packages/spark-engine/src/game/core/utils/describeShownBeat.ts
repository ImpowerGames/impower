import { stripStyleCodes } from "@impower/sparkdown/src/runtime/displayStyle";
import type { TextInstruction } from "../types/Instruction";
import type { Instructions } from "../types/Instructions";
import type { ShownBeatDescription } from "../types/ShownBeatDescription";

const NAME_TARGET = "character_name";

const CUE_TARGETS = new Set([NAME_TARGET, "character_parenthetical"]);

const plain = (text: string) => stripStyleCodes(text).replace(/\s+/g, " ").trim();

const written = (events: readonly TextInstruction[] | undefined) =>
  (events ?? []).map((event) => event.text ?? "").join("");

export const describeShownBeat = (beat: Instructions): ShownBeatDescription => {
  const text = beat.text ?? {};
  const words = Object.entries(text)
    .filter(([target]) => !CUE_TARGETS.has(target) && !target.startsWith("choice "))
    .map(([, events]) => written(events))
    .join(" ");
  const speaker = plain(written(text[NAME_TARGET]));
  const options = (beat.options ?? []).map(plain);
  return {
    kind: beat.kind ?? null,
    ...(speaker ? { speaker } : {}),
    words: plain(words),
    ...(options.length ? { options } : {}),
  };
};
