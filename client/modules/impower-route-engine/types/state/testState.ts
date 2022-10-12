export type Mode = "Edit" | "Test";

export type Control = "Play" | "Pause";

export type Playback =
  | "Default"
  | "Forward"
  | "Backward"
  | "SkipForward"
  | "SkipBackward";

export type Layout = "Page" | "Game";

export interface TestState {
  mode: Mode;
  paused: boolean;
  playback: Playback;
  layout: Layout;
  debug: boolean;
  playerVisibility: boolean;
  compiling: Record<string, boolean>;
}
