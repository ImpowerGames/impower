import { useEffect } from "react";

export const useArrowShortcuts = (
  onArrowUp: (e: KeyboardEvent) => void,
  onArrowDown: (e: KeyboardEvent) => void,
  onArrowLeft: (e: KeyboardEvent) => void,
  onArrowRight: (e: KeyboardEvent) => void
): void => {
  useEffect(() => {
    const onWindowKeyDown = (event: KeyboardEvent): void => {
      if (event.defaultPrevented) {
        return;
      }
      if (event.key === "ArrowUp") {
        onArrowUp(event);
      }
      if (event.key === "ArrowDown") {
        onArrowDown(event);
      }
      if (event.key === "ArrowLeft") {
        onArrowLeft(event);
      }
      if (event.key === "ArrowRight") {
        onArrowRight(event);
      }
    };
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
