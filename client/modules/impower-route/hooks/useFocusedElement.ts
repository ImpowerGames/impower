import { useEffect, useState } from "react";

export const useFocusedElement = (): {
  focusedElement: Element;
  listenersReady: boolean;
} => {
  const [listenersReady, setListenersReady] = useState(false);
  const [focusedElement, setFocusedElement] = useState(document.activeElement);

  useEffect(() => {
    const onFocus = (event): void => setFocusedElement(event.target);
    const onBlur = (): void => setFocusedElement(null);

    window.addEventListener("focus", onFocus, true);
    window.addEventListener("blur", onBlur, true);

    setListenersReady(true);

    return (): void => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return {
    focusedElement,
    listenersReady,
  };
};
