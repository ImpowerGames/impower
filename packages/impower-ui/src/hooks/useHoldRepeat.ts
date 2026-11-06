import { useEffect, useRef, useState } from "preact/hooks";

export const HOLD_REPEAT_DELAY_MS = 400;
export const HOLD_REPEAT_INTERVAL_MS = 100;

export interface HoldRepeatHandlers {
  pressed: boolean;
  onPointerDown: (e: PointerEvent) => void;
  onPointerUp: () => void;
  onPointerCancel: () => void;
  onPointerLeave: () => void;
  onClick: (e: MouseEvent) => void;
}

export function useHoldRepeat(action: () => void): HoldRepeatHandlers {
  const [pressed, setPressed] = useState(false);
  const timer = useRef(0);
  const repeated = useRef(false);
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
      if (e.button !== 0) {
        return;
      }
      clear();
      repeated.current = false;
      setPressed(true);
      const repeat = () => {
        repeated.current = true;
        latest.current();
        timer.current = window.setTimeout(repeat, HOLD_REPEAT_INTERVAL_MS);
      };
      timer.current = window.setTimeout(repeat, HOLD_REPEAT_DELAY_MS);
    },
    onPointerUp: release,
    onPointerCancel: () => {
      repeated.current = false;
      release();
    },
    onPointerLeave: () => {
      repeated.current = false;
      release();
    },
    onClick: (e: MouseEvent) => {
      if (repeated.current) {
        repeated.current = false;
        e.preventDefault();
        return;
      }
      latest.current();
    },
  };
}
