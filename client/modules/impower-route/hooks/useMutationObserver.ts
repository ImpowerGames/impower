import { useEffect } from "react";

const config: MutationObserverInit = {
  attributes: true,
  characterData: true,
  childList: true,
  subtree: true,
};

export const useMutationObserver = (
  el: HTMLElement,
  callback: MutationCallback,
  options: MutationObserverInit = config
): void => {
  useEffect(() => {
    if (!el) {
      return (): void => null;
    }

    const observer = new MutationObserver(callback);
    observer.observe(el, options);

    return (): void => {
      observer.disconnect();
    };
  }, [callback, options, el]);
};
