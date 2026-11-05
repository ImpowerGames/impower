import { useEffect, useRef, useState } from "preact/hooks";

const HOLD_REPEAT_DELAY_MS = 400;
const HOLD_REPEAT_INTERVAL_MS = 100;

export const useHoldRepeat = (action: () => void) => {
  const [pressed, setPressed] = useState(false);
  const timer = useRef(0);
  const latest = useRef(action);
  latest.current = action;

  const clear = () => {
    if (timer.current) {
      window.clearTimeout(timer.current);
      timer.current = 0;
    }
  };

  useEffect(() => clear, []);

  const release = () => {
    clear();
    setPressed(false);
  };

  return {
    pressed,
    onPointerDown: (e: PointerEvent) => {
      e.stopPropagation();
      if (e.button !== 0) {
        return;
      }
      clear();
      setPressed(true);
      latest.current();
      const repeat = () => {
        latest.current();
        timer.current = window.setTimeout(repeat, HOLD_REPEAT_INTERVAL_MS);
      };
      timer.current = window.setTimeout(repeat, HOLD_REPEAT_DELAY_MS);
    },
    onPointerUp: release,
    onPointerCancel: release,
    onPointerLeave: release,
    onClick: (e: MouseEvent) => {
      if (e.detail > 0) {
        e.preventDefault();
        return;
      }
      latest.current();
    },
  };
};
