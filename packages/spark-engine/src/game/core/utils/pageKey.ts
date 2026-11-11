import type { Instructions } from "../types/Instructions";

export function pageKey(instructions: Instructions): string {
  const { hold, ...beat } = instructions;
  return JSON.stringify(beat);
}
