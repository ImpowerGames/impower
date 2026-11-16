import { useEffect, useState } from "preact/hooks";
import { fitToKeyboard, keyboard, type Keyboard } from "../layout/keyboard";

const CLOSED: Keyboard = { open: false, height: 0 };

export function useKeyboardFit(enabled: boolean): Keyboard {
  const [state, setState] = useState<Keyboard>(CLOSED);
  useEffect(() => {
    if (!enabled) {
      return undefined;
    }
    const release = fitToKeyboard(setState);
    setState(keyboard());
    return release;
  }, [enabled]);
  return enabled ? state : CLOSED;
}
