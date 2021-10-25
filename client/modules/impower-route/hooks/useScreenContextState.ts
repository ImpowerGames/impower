import { useEffect, useMemo, useRef, useState } from "react";
import { ScreenContextState } from "../contexts/screenContext";
import { useFullscreen } from "./useFullscreen";

export const useScreenContextState = (data: {
  onScreenKeyboardMinHeight?: number;
}): ScreenContextState => {
  const { onScreenKeyboardMinHeight = 768 } = data;
  const [windowWidth, setWindowWidth] = useState<number>();
  const [windowHeight, setWindowHeight] = useState<number>();
  const [onScreenKeyboard, setOnScreenKeyboard] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const initialInnerHeight = useRef<number>();

  useFullscreen(fullscreen);

  useEffect(() => {
    // Initialize state on mount
    if (initialInnerHeight.current === undefined) {
      initialInnerHeight.current = window.innerHeight;
    }
    setWindowWidth(window.innerWidth);
    setWindowHeight(window.innerHeight);
  }, []);

  useEffect(() => {
    const handleResize = (): void => {
      // Only assume onScreenKeyboard will appear on touch devices below a certain height
      if (
        !window.matchMedia("(hover: hover) and (pointer: fine)").matches &&
        windowHeight < onScreenKeyboardMinHeight
      ) {
        if (window.innerHeight < initialInnerHeight.current) {
          setOnScreenKeyboard(true);
        } else {
          // Only consider the keyboard hidden if it stays hidden for 0.3 seconds.
          // This prevents the interface from rearranging itself while focus switches from one input to another.
          window.setTimeout(() => {
            if (window.innerHeight >= initialInnerHeight.current) {
              setOnScreenKeyboard(false);
            }
          }, 300);
        }
      }
      setWindowWidth(window.innerWidth);
      setWindowHeight(window.innerHeight);
    };
    window.addEventListener("resize", handleResize, {
      passive: true,
    });
    return (): void => {
      window.removeEventListener("resize", handleResize);
    };
  }, [setOnScreenKeyboard, windowHeight, onScreenKeyboardMinHeight]);

  const screenContext = useMemo(
    () => ({
      onScreenKeyboard,
      windowWidth,
      windowHeight,
      fullscreen,
      setFullscreen,
    }),
    [onScreenKeyboard, windowWidth, windowHeight, fullscreen, setFullscreen]
  );

  return screenContext;
};
