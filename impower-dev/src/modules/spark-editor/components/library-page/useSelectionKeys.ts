import { useEffect, useRef } from "preact/hooks";

export type SelectionKeysOptions = {
  active: boolean;
  paused: boolean;
  onEnd: () => void;
  onSelectAll: () => void;
};

export function useSelectionKeys(options: SelectionKeysOptions) {
  const latest = useRef(options);
  latest.current = options;
  const { active, paused } = options;
  useEffect(() => {
    if (!active || paused) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }
      const typing =
        event.target instanceof HTMLTextAreaElement ||
        (event.target instanceof HTMLInputElement && event.target.type !== "checkbox");
      if (event.key === "Escape") {
        event.preventDefault();
        latest.current.onEnd();
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a" && !typing) {
        event.preventDefault();
        latest.current.onSelectAll();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, paused]);
}
