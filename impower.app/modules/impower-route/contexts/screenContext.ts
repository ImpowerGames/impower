import React from "react";

export interface ScreenContextState {
  onScreenKeyboard: boolean;
  fullscreen: boolean;
  windowWidth: number;
  windowHeight: number;
  setFullscreen: (fullscreen: boolean) => void;
}

export const createScreenContextState = (): ScreenContextState => ({
  onScreenKeyboard: false,
  fullscreen: false,
  windowWidth: 0,
  windowHeight: 0,
  setFullscreen: (): void => null,
});

export const ScreenContext = React.createContext<ScreenContextState>(undefined);
