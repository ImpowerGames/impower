import { useEffect } from "react";
import { isCtrlKeyPressed } from "../utils/events";

/*
preventDefault: Control if defaults should be prevented.  This can be disabled when selecting objects.  However, you could also allow it when selecting text during a rename.
enableShortcut: Since this hook can be shared across multiple files, check to make sure that this selection is happening on the expected panel.
*/
export const useSelectionShortcuts = (
  onSelectNone: () => void,
  onSelectAll: () => void
): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      onSelectNone();
    }
    if (isCtrlKeyPressed(event) && event.key === "a") {
      event.preventDefault();
      onSelectAll();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
