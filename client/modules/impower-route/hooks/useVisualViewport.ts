import { useEffect, useRef, useState } from "react";

const useVisualViewport = (viewport: HTMLElement): boolean => {
  const pendingViewportUpdate = useRef(false);
  const [visualViewportSupported, setVisualViewportSupported] =
    useState<boolean>();

  useEffect(() => {
    setVisualViewportSupported(Boolean(window.visualViewport));

    const onViewportChange = (event): void => {
      if (pendingViewportUpdate.current) {
        return;
      }
      pendingViewportUpdate.current = true;
      requestAnimationFrame(() => {
        pendingViewportUpdate.current = false;
        if (viewport) {
          const visualViewport = event.target;
          viewport.style.maxHeight = `${visualViewport.height}px`;
        }
      });
    };

    if (window.visualViewport) {
      window.visualViewport.addEventListener("scroll", onViewportChange, {
        passive: true,
      });
      window.visualViewport.addEventListener("resize", onViewportChange, {
        passive: true,
      });
    }
    return (): void => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("scroll", onViewportChange);
        window.visualViewport.removeEventListener("resize", onViewportChange);
      }
    };
  }, [viewport]);

  return visualViewportSupported;
};

export default useVisualViewport;
