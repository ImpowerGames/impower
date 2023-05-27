import { useEffect, useState } from "react";

const isInput = (element: Element): boolean => {
  if (!element) {
    return false;
  }
  const tagName = element?.tagName;
  if (!tagName) {
    return false;
  }
  if (tagName.toLowerCase() === "textarea") return true;
  if (tagName.toLowerCase() !== "input") return false;
  const type = element?.getAttribute("type")?.toLowerCase();
  const inputTypes = [
    "text",
    "password",
    "number",
    "email",
    "tel",
    "url",
    "search",
    "date",
    "datetime",
    "datetime-local",
    "time",
    "month",
    "week",
  ];
  return inputTypes.indexOf(type) >= 0;
};

export const useFocusedInput = (): {
  focusedInput: HTMLInputElement | HTMLTextAreaElement;
  listenersReady: boolean;
} => {
  const [listenersReady, setListenersReady] = useState(false);
  const [focusedInput, setFocusedInput] = useState(
    isInput(document.activeElement) ? document.activeElement : null
  );

  useEffect(() => {
    const onFocus = (event): void => {
      if (isInput(event.target)) {
        setFocusedInput(event.target);
      }
    };
    const onBlur = (): void => setFocusedInput(null);

    window.addEventListener("focus", onFocus, true);
    window.addEventListener("blur", onBlur, true);

    setListenersReady(true);

    return (): void => {
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  return {
    focusedInput: focusedInput as HTMLInputElement | HTMLTextAreaElement,
    listenersReady,
  };
};
