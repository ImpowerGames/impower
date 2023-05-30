import { useEffect } from "react";

export const useRenameShortcuts = (onRename: () => void): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "F2") {
      onRename();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
