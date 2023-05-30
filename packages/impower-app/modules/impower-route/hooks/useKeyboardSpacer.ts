import { useEffect, useRef, useState } from "react";

const useKeyboardSpacer = (
  viewport: HTMLElement,
  spacer: HTMLElement
): boolean => {
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
        if (viewport && spacer) {
          const visualViewport = event.target;
          const keyboardHeight =
            viewport.getBoundingClientRect().height - visualViewport.height;
          spacer.style.minHeight = `${keyboardHeight}px`;
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
  }, [viewport, spacer]);

  return visualViewportSupported;
};

export default useKeyboardSpacer;
