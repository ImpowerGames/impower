import { useEffect } from "preact/hooks";
import { fitToKeyboard } from "../layout/keyboard";

export function useKeyboardFit(enabled: boolean): void {
  useEffect(() => (enabled ? fitToKeyboard() : undefined), [enabled]);
}
