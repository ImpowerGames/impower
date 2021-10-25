import { useEffect } from "react";
import { isCtrlKeyPressed } from "../utils/events";

export const useClipboardShortcuts = (
  onCut: () => void,
  onCopy: () => void,
  onPaste: () => void
): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (isCtrlKeyPressed(event) && event.key === "x") {
      onCut();
    }
    if (isCtrlKeyPressed(event) && event.key === "c") {
      onCopy();
    }
    if (isCtrlKeyPressed(event) && event.key === "v") {
      onPaste();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
