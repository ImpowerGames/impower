import { useEffect } from "react";
import { isDocument } from "../types/definitions/document";
import { isHTMLElement } from "../types/definitions/htmlElement";

export const isFullScreen = (el?: HTMLElement): boolean => {
  if (!isDocument(document)) {
    return false;
  }
  if (el) {
    return Boolean(
      document.fullscreenElement === el ||
        document.mozFullScreenElement === el ||
        document.webkitFullscreenElement === el ||
        document.msFullscreenElement === el
    );
  }

  return Boolean(
    document.fullscreenElement ||
      document.mozFullScreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      document.fullscreen ||
      document.mozFullScreen ||
      document.webkitIsFullScreen ||
      document.fullScreenMode
  );
};

export const useFullscreen = (fullscreen: boolean): void => {
  useEffect(() => {
    const element = document.documentElement;

    const openFullScreen = (): void => {
      if (document.fullscreenEnabled) {
        if (isHTMLElement(element)) {
          if (element.requestFullscreen) {
            element.requestFullscreen().catch(async (err) => {
              const logWarn = (
                await import("../../impower-logger/utils/logWarn")
              ).default;
              logWarn("Route", err);
            });
            return;
          }
          if (element.mozRequestFullScreen) {
            element.mozRequestFullScreen();
            return;
          }
          if (element.webkitRequestFullscreen) {
            element.webkitRequestFullscreen(
              (Element as any).ALLOW_KEYBOARD_INPUT // eslint-disable-line @typescript-eslint/no-explicit-any
            );
            return;
          }
          if (element.msRequestFullscreen) {
            element.msRequestFullscreen();
          }
        }
      }
    };

    const closeFullScreen = (): void => {
      if (document.fullscreenEnabled) {
        if (isDocument(document)) {
          if (document.exitFullscreen) document.exitFullscreen();
          if (document.mozCancelFullScreen) document.mozCancelFullScreen();
          if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          if (document.msExitFullscreen) document.msExitFullscreen();
        }
      }
    };

    if (fullscreen && !isFullScreen(element)) {
      openFullScreen();
    } else if (!fullscreen && isFullScreen(element)) {
      closeFullScreen();
    }
  }, [fullscreen]);
};

export const useFullscreenChange = (
  onExit: () => void,
  onEnter: () => void
): void => {
  useEffect(() => {
    const handleChange = (): void => {
      if (isFullScreen()) {
        onEnter();
      } else {
        onExit();
      }
    };

    document.addEventListener("fullscreenchange", handleChange);
    document.addEventListener("mozfullscreenchange", handleChange);
    document.addEventListener("MSFullscreenChange", handleChange);
    document.addEventListener("webkitfullscreenchange", handleChange);
    return (): void => {
      document.removeEventListener("fullscreenchange", handleChange);
      document.removeEventListener("mozfullscreenchange", handleChange);
      document.removeEventListener("MSFullscreenChange", handleChange);
      document.removeEventListener("webkitfullscreenchange", handleChange);
    };
  });
};
