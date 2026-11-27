import type { Instructions } from "../types/Instructions";

function unrouted(instructions: Instructions): Instructions {
  const layout = Object.entries(instructions.layout ?? {}).flatMap(
    ([name, events]) => {
      const own = events.filter((event) => !event.auto);
      return own.length > 0 ? [[name, own] as const] : [];
    },
  );
  if (layout.length > 0) {
    return { ...instructions, layout: Object.fromEntries(layout) };
  }
  const { layout: _routed, ...rest } = instructions;
  return rest;
}

export function pageKey(instructions: Instructions): string {
  const routed = Object.values(instructions.layout ?? {}).some((events) =>
    events.some((event) => event.auto),
  );
  const { hold, speech, ...beat } = routed ? unrouted(instructions) : instructions;
  return JSON.stringify(beat);
}
