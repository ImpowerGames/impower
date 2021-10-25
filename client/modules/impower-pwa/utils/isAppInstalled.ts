import { isIosNavigator } from "../types/navigator";

export const isAppInstalled = (): boolean => {
  return (
    (isIosNavigator(navigator) && navigator.standalone) ||
    (window && window.matchMedia("(display-mode: standalone)").matches)
  );
};
