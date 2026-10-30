import { useEffect, useState } from "preact/hooks";

const DESKTOP_QUERY = "(min-width: 960px)";

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
