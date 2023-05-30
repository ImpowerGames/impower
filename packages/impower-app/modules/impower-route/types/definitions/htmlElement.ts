export interface HTMLElement extends globalThis.HTMLElement {
  mozRequestFullScreen: () => void;
  webkitRequestFullscreen: (option?: unknown) => void;
  msRequestFullscreen: () => void;
}

export const isHTMLElement = (obj: unknown): obj is HTMLElement => {
  if (!obj) {
    return false;
  }
  const element = obj as HTMLElement;
  return (
    element.requestFullscreen !== undefined ||
    element.mozRequestFullScreen !== undefined ||
    element.webkitRequestFullscreen !== undefined ||
    element.msRequestFullscreen !== undefined
  );
};
