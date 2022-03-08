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
  control: Control;
  playback: Playback;
  layout: Layout;
  debug: boolean;
  startTime: number;
  playerVisibility: boolean;
}
