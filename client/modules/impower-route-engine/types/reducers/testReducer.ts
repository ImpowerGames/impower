import {
  TestAction,
  TEST_CONTROL_CHANGE,
  TEST_DEBUG,
  TEST_LAYOUT_CHANGE,
  TEST_MODE_CHANGE,
  TEST_PLAYBACK_CHANGE,
  TEST_PLAYER_VISIBILITY,
  TEST_START_TIME_CHANGE,
} from "../actions/testActions";
import { Control, Layout, Mode, Playback, TestState } from "../state/testState";
import { createTestState } from "../utils/createTestState";

const doTestModeChange = (
  state: TestState,
  payload: { mode: Mode }
): TestState => {
  const { mode } = payload;

  return {
    ...state,
    mode,
  };
};

const doTestControlChange = (
  state: TestState,
  payload: { control: Control }
): TestState => {
  const { control } = payload;

  return {
    ...state,
    control,
  };
};

const doTestPlaybackChange = (
  state: TestState,
  payload: { playback: Playback }
): TestState => {
  const { playback } = payload;

  return {
    ...state,
    playback,
  };
};

const doTestStartTimeChange = (
  state: TestState,
  payload: { startTime: number }
): TestState => {
  const { startTime } = payload;

  return {
    ...state,
    startTime,
  };
};

const doTestLayoutChange = (
  state: TestState,
  payload: { layout: Layout }
): TestState => {
  const { layout } = payload;

  return {
    ...state,
    layout,
  };
};

const doTestDebug = (
  state: TestState,
  payload: { debug: boolean }
): TestState => {
  const { debug } = payload;

  return {
    ...state,
    debug,
  };
};

const doPlayerVisibility = (
  state: TestState,
  payload: { playerVisibility: boolean }
): TestState => {
  const { playerVisibility } = payload;

  return {
    ...state,
    playerVisibility,
  };
};

export const testReducer = (
  state = createTestState(),
  action: TestAction
): TestState => {
  switch (action.type) {
    case TEST_MODE_CHANGE:
      return doTestModeChange(state, action.payload);
    case TEST_CONTROL_CHANGE:
      return doTestControlChange(state, action.payload);
    case TEST_PLAYBACK_CHANGE:
      return doTestPlaybackChange(state, action.payload);
    case TEST_START_TIME_CHANGE:
      return doTestStartTimeChange(state, action.payload);
    case TEST_LAYOUT_CHANGE:
      return doTestLayoutChange(state, action.payload);
    case TEST_DEBUG:
      return doTestDebug(state, action.payload);
    case TEST_PLAYER_VISIBILITY:
      return doPlayerVisibility(state, action.payload);
    default:
      return state;
  }
};
