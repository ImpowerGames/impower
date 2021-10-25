import { useEffect } from "react";

export const usePageShortcuts = (
  onPageUp: () => void,
  onPageDown: () => void
): void => {
  const onWindowKeyDown = (event: KeyboardEvent): void => {
    if (event.defaultPrevented) {
      return;
    }
    if (event.key === "PageUp") {
      onPageUp();
    }
    if (event.key === "PageDown") {
      onPageDown();
    }
  };

  useEffect(() => {
    window.addEventListener("keydown", onWindowKeyDown);
    return (): void => {
      window.removeEventListener("keydown", onWindowKeyDown);
    };
  });
};
