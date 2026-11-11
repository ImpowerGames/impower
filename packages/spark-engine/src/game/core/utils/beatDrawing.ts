import type { Instructions } from "../types/Instructions";
import type { ScriptLocation } from "../types/ScriptLocation";

export type Delivery = "landing" | "redelivery";

export type BeatDrawing = "typed" | "settled";

export const drawsSettled = (beat: Instructions): boolean =>
  !beat.load?.length &&
  !beat.cutscene?.length &&
  Object.values(beat.image ?? {}).every((events) => events.length === 0) &&
  Object.entries(beat.audio ?? {}).every(
    ([target, events]) => target === "typewriter" || events.length === 0,
  );

const sameSource = (a?: ScriptLocation, b?: ScriptLocation): boolean =>
  a != null && b != null && a.length === b.length && a.every((v, i) => v === b[i]);

export const beatDrawing = (
  beat: Instructions,
  delivery: Delivery,
  onScreen: Instructions | undefined,
): BeatDrawing =>
  delivery === "redelivery" &&
  onScreen != null &&
  sameSource(beat.source, onScreen.source) &&
  JSON.stringify(beat.text ?? {}) === JSON.stringify(onScreen.text ?? {}) &&
  drawsSettled(beat)
    ? "settled"
    : "typed";
