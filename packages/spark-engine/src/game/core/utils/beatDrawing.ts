import type { Instructions } from "../types/Instructions";

export type Delivery = "landing" | "redelivery";

const reads = (beat: Instructions) =>
  JSON.stringify([
    beat.kind ?? null,
    beat.speaker ?? null,
    Object.entries(beat.text ?? {}).map(([target, events]) => [
      target,
      events.map((event) => [event.text, event.style ?? null]),
    ]),
  ]);

export const beatDrawing = (
  beat: Instructions,
  delivery: Delivery,
  onScreen: Instructions | undefined,
): Instructions => {
  if (
    delivery !== "redelivery" ||
    !onScreen ||
    !beat.text ||
    reads(beat) !== reads(onScreen)
  ) {
    return beat;
  }
  return {
    ...beat,
    text: Object.fromEntries(
      Object.entries(beat.text).map(([target, events]) => [
        target,
        events.map((event) => ({ ...event, after: 0, over: 0 })),
      ]),
    ),
    ...(beat.audio
      ? {
          audio: Object.fromEntries(
            Object.entries(beat.audio).filter(([target]) => target !== "typewriter"),
          ),
        }
      : {}),
    end: 0,
  };
};
