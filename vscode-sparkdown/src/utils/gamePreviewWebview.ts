export interface SystemMotionReport {
  systemReducesMotion: boolean;
}

export const systemMotionReport = (
  systemReducesMotion: boolean,
): SystemMotionReport => ({ systemReducesMotion });

export const isSystemMotionReport = (
  message: unknown,
): message is SystemMotionReport =>
  message != null &&
  typeof message === "object" &&
  typeof (message as SystemMotionReport).systemReducesMotion === "boolean";

export const replayBeatShortcut = (userAgent: string) =>
  /Mac|iPhone|iPad/.test(userAgent) ? "⌥⌘Enter" : "Ctrl+Alt+Enter";
