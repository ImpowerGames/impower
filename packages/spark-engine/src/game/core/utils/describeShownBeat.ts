import { stripStyleCodes } from "@impower/sparkdown/src/runtime/displayStyle";
import { beatKindOfTarget } from "../constants/BEAT_KIND_OF_TARGET";
import type { TextInstruction } from "../types/Instruction";
import type { Instructions } from "../types/Instructions";
import type { ShownBeatDescription, ShownBeatWrite } from "../types/ShownBeatDescription";

const NAME_TARGET = "character_name";

const plain = (text: string) => stripStyleCodes(text).replace(/\s+/g, " ").trim();

const written = (events: readonly TextInstruction[] | undefined) =>
  (events ?? []).map((event) => event.text ?? "").join("");

const firstWrite = (text: Record<string, TextInstruction[]>): ShownBeatWrite | undefined =>
  Object.entries(text)
    .filter(([target]) => target !== NAME_TARGET && beatKindOfTarget(target) === undefined)
    .map(([target, events]) => ({ target, value: plain(written(events)) }))
    .find(({ value }) => value);

export const describeShownBeat = (beat: Instructions): ShownBeatDescription => {
  const text = beat.text ?? {};
  const words = plain(
    Object.entries(text)
      .filter(([target]) => beatKindOfTarget(target) !== undefined)
      .map(([, events]) => written(events))
      .join(" "),
  );
  const speaker = plain(written(text[NAME_TARGET]));
  const options = (beat.options ?? []).map(plain);
  const write = !words && !options.length && !beat.kind ? firstWrite(text) : undefined;
  return {
    kind: beat.kind ?? null,
    ...(speaker ? { speaker } : {}),
    words,
    ...(options.length ? { options } : {}),
    ...(write ? { write } : {}),
  };
};
