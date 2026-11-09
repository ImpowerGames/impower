import { useEffect } from "preact/hooks";
import { withSearch } from "./withSearch";

const isFindShortcut = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === "f";

const isStepShortcut = (event: KeyboardEvent) =>
  !event.altKey &&
  (event.key === "F3"
    ? !event.metaKey && !event.ctrlKey
    : (event.metaKey || event.ctrlKey) &&
      event.shiftKey &&
      event.key.toLowerCase() === "g");

export default function useFindShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const step = isStepShortcut(event);
      if (!step && !isFindShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const backward = event.shiftKey;
      withSearch((search) =>
        step ? search.stepOrOpen(backward) : search.openFindFromSelection(),
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
