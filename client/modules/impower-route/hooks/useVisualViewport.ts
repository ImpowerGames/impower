import { useEffect, useRef, useState } from "react";

const useVisualViewport = (viewport: HTMLElement, offset = 0): boolean => {
  const pendingViewportUpdate = useRef(false);
  const [visualViewportSupported, setVisualViewportSupported] =
    useState<boolean>();

  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  useEffect(() => {
    setVisualViewportSupported(Boolean(window.visualViewport));

    const onViewportChange = (event): void => {
      if (pendingViewportUpdate.current) {
        return;
      }
      pendingViewportUpdate.current = true;
      window.requestAnimationFrame(() => {
        pendingViewportUpdate.current = false;
        if (viewport) {
          const visualViewport = event.target;
          viewport.style.maxHeight = `${
            visualViewport.height + offsetRef.current
          }px`;
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
