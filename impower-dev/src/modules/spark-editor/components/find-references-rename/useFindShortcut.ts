import { useEffect } from "preact/hooks";
import { withSearch } from "./withSearch";

const isFindShortcut = (event: KeyboardEvent) =>
  (event.metaKey || event.ctrlKey) &&
  !event.altKey &&
  !event.shiftKey &&
  event.key.toLowerCase() === "f";

export default function useFindShortcut() {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!isFindShortcut(event)) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      withSearch((search) => search.openFindFromSelection());
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);
}
