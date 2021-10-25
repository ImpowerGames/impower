import { Control, Playback, Mode, Layout } from "../state/testState";

export const TEST_MODE_CHANGE = "TEST_MODE_CHANGE";
export interface TestModeChangeAction {
  type: typeof TEST_MODE_CHANGE;
  payload: { mode: Mode };
}
export const testModeChange = (mode: Mode): TestModeChangeAction => {
  return { type: TEST_MODE_CHANGE, payload: { mode } };
};

export const TEST_CONTROL_CHANGE = "TEST_CONTROL_CHANGE";
export interface TestControlChangeAction {
  type: typeof TEST_CONTROL_CHANGE;
  payload: { control: Control };
}
export const testControlChange = (
  control: Control
): TestControlChangeAction => {
  return { type: TEST_CONTROL_CHANGE, payload: { control } };
};

export const TEST_PLAYBACK_CHANGE = "TEST_PLAYBACK_CHANGE";
export interface TestPlaybackChangeAction {
  type: typeof TEST_PLAYBACK_CHANGE;
  payload: { playback: Playback };
}
export const testPlaybackChange = (
  playback: Playback
): TestPlaybackChangeAction => {
  return { type: TEST_PLAYBACK_CHANGE, payload: { playback } };
};

export const TEST_START_TIME_CHANGE = "TEST_START_TIME_CHANGE";
export interface TestStartTimeChangeAction {
  type: typeof TEST_START_TIME_CHANGE;
  payload: { startTime: number };
}
export const testStartTimeChange = (
  startTime: number
): TestStartTimeChangeAction => {
  return { type: TEST_START_TIME_CHANGE, payload: { startTime } };
};

export const TEST_LAYOUT_CHANGE = "TEST_LAYOUT_CHANGE";
export interface TestLayoutChangeAction {
  type: typeof TEST_LAYOUT_CHANGE;
  payload: { layout: Layout };
}
export const testLayoutChange = (layout: Layout): TestLayoutChangeAction => {
  return { type: TEST_LAYOUT_CHANGE, payload: { layout } };
};

export const TEST_DEBUG = "TEST_DEBUG";
export interface TestDebugAction {
  type: typeof TEST_DEBUG;
  payload: { debug: boolean };
}
export const testDebug = (debug: boolean): TestDebugAction => {
  return { type: TEST_DEBUG, payload: { debug } };
};

export const TEST_PLAYER_VISIBILITY = "TEST_PLAYER_VISIBILITY";
export interface TestPlayerVisibilityAction {
  type: typeof TEST_PLAYER_VISIBILITY;
  payload: { playerVisibility: boolean };
}
export const testPlayerVisibility = (
  playerVisibility: boolean
): TestPlayerVisibilityAction => {
  return { type: TEST_PLAYER_VISIBILITY, payload: { playerVisibility } };
};

export type TestAction =
  | TestModeChangeAction
  | TestControlChangeAction
  | TestPlaybackChangeAction
  | TestStartTimeChangeAction
  | TestLayoutChangeAction
  | TestDebugAction
  | TestPlayerVisibilityAction;
