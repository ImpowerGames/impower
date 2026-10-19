import type { FrameRequestCallback } from "../classes/Clock";

export interface SystemConfiguration {
  /** The current time in milliseconds. */
  now?: () => number;
  resolve?: (path: string) => string;
  fetch?: (url: string) => Promise<string | ArrayBuffer>;
  log?: (message: unknown, severity: "info" | "warning" | "error") => void;
  setTimeout?: (handler: Function, timeout?: number, ...args: any[]) => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
  /** Send each display and each played beat to the page as one composed
   *  `ui/beat` (#1820), which the page puts up in one frame at the instant
   *  the beat's text starts revealing. The worker that shows the preview and
   *  PLAY sets it; a host that does not leaves every op sent as it happens. */
  composeBeats?: boolean;
}
