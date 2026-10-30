import type { IKeyboardEvent } from "../types/IKeyboardEvent";

const ADVANCE_KEYS = ["Enter", " "];

export function isAdvanceKey(
  event: Pick<
    IKeyboardEvent<"keydown">,
    "key" | "repeat" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey"
  >,
): boolean {
  if (event.repeat) {
    return false;
  }
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
    return false;
  }
  return ADVANCE_KEYS.includes(event.key);
}
