import { Layout, Mode, Playback } from "../state/testState";

export const TEST_MODE_CHANGE = "TEST_MODE_CHANGE";
export interface TestModeChangeAction {
  type: typeof TEST_MODE_CHANGE;
  payload: { mode: Mode };
}
export const testModeChange = (mode: Mode): TestModeChangeAction => {
  return { type: TEST_MODE_CHANGE, payload: { mode } };
};

export const TEST_PAUSE = "TEST_PAUSE";
export interface TestPauseAction {
  type: typeof TEST_PAUSE;
  payload: { pause: boolean };
}
export const testPause = (pause: boolean): TestPauseAction => {
  return { type: TEST_PAUSE, payload: { pause } };
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

export const TEST_SET_COMPILING = "TEST_SET_COMPILING";
export interface TestSetCompilingAction {
  type: typeof TEST_SET_COMPILING;
  payload: {
    id: string;
    compiling: boolean;
  };
}
export const testSetCompiling = (
  id: string,
  compiling: boolean
): TestSetCompilingAction => {
  return { type: TEST_SET_COMPILING, payload: { id, compiling } };
};

export type TestAction =
  | TestModeChangeAction
  | TestPauseAction
  | TestPlaybackChangeAction
  | TestLayoutChangeAction
  | TestDebugAction
  | TestPlayerVisibilityAction
  | TestSetCompilingAction;
