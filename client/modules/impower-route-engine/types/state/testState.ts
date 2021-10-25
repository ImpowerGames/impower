export enum Mode {
  Edit = "Edit",
  Test = "Test",
}

export enum Control {
  Play = "Play",
  Pause = "Pause",
}

export enum Playback {
  Default = "Default",
  Forward = "Forward",
  Backward = "Backward",
  SkipForward = "SkipForward",
  SkipBackward = "SkipBackward",
}

export enum Layout {
  Page = "Page",
  Game = "Game",
}

export interface TestState {
  mode: Mode;
  control: Control;
  playback: Playback;
  layout: Layout;
  debug: boolean;
  startTime: number;
  playerVisibility: boolean;
}

export const createTestState = (): TestState => ({
  mode: Mode.Edit,
  control: Control.Play,
  playback: Playback.Default,
  layout: Layout.Page,
  debug: false,
  startTime: 0,
  playerVisibility: true,
});
