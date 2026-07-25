import { useEffect, useState } from "preact/hooks";

// The editor switches to its vertical/mobile layout below 960px — see
// WorkspaceWindow's `matchMedia("(min-width: 960px)")` that drives
// `screen.horizontalLayout`. Mirror that exact breakpoint here so menus flip to
// bottom sheets at the same point the rest of the app goes mobile.
const DESKTOP_QUERY = "(min-width: 960px)";

/**
 * `true` when the viewport is below the editor's desktop breakpoint (960px).
 * SSR-safe (assumes desktop on the server, then corrects on mount) and updates
 * live as the viewport crosses the breakpoint.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() =>
    typeof window === "undefined"
      ? false
      : !window.matchMedia(DESKTOP_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const mql = window.matchMedia(DESKTOP_QUERY);
    const update = () => setIsMobile(!mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}

export default useIsMobile;
