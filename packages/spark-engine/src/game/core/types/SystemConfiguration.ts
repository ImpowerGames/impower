import { FrameRequestCallback } from "../classes/Clock";

export interface SystemConfiguration {
  now?: () => number;
  resolve?: (path: string) => string;
  fetch?: (url: string) => Promise<string | ArrayBuffer>;
  log?: (message: unknown, severity: "info" | "warning" | "error") => void;
  setTimeout?: (handler: Function, timeout?: number, ...args: any[]) => number;
  requestFrame?: (callback: FrameRequestCallback) => number;
}
