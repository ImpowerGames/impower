import type { IKeyboardEvent } from "../types/IKeyboardEvent";

/**
 * Keys that advance the game the same way a tap does.
 */
const ADVANCE_KEYS = ["Enter", " "];

/**
 * Whether a keypress should advance the game the same way a tap does.
 * Auto-repeat is ignored so that holding the key down doesn't blast through
 * several beats at once, and modified presses are left alone so they stay
 * available as shortcuts. The page skips a cutscene on the same keys.
 */
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
