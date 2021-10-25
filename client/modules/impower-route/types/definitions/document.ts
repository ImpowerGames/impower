export interface Document extends globalThis.Document {
  fullscreen: boolean;
  mozFullScreen: boolean;
  webkitIsFullScreen: boolean;
  fullScreenMode: boolean;
  fullscreenElement: HTMLElement;
  mozFullScreenElement: HTMLElement;
  webkitFullscreenElement: HTMLElement;
  msFullscreenElement: HTMLElement;
  mozCancelFullScreen: () => void;
  webkitExitFullscreen: () => void;
  msExitFullscreen: () => void;
}

export const isDocument = (obj: unknown): obj is Document => {
  if (!obj) {
    return false;
  }
  const document = obj as Document;
  return (
    document.fullscreen !== undefined ||
    document.mozFullScreen !== undefined ||
    document.webkitIsFullScreen !== undefined ||
    document.fullScreenMode !== undefined
  );
};
