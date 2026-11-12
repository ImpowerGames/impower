import type { Instructions } from "../types/Instructions";

export function pageKey(instructions: Instructions): string {
  const { hold, speech, ...beat } = instructions;
  return JSON.stringify(beat);
}
