import type { Instructions } from "../types/Instructions";

export type Delivery = "landing" | "redelivery";

const runs = (events: { text: string; style?: unknown }[]) =>
  events.reduce<[string, string][]>((read, event) => {
    if (!event.text) {
      return read;
    }
    const style = JSON.stringify(event.style ?? null);
    const last = read.at(-1);
    if (last && last[1] === style) {
      last[0] += event.text;
    } else {
      read.push([event.text, style]);
    }
    return read;
  }, []);

const reads = (beat: Instructions) =>
  JSON.stringify([
    beat.kind ?? null,
    beat.speaker ?? null,
    Object.entries(beat.text ?? {}).map(([target, events]) => [
      target,
      runs(events),
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
