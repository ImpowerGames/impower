import { createTestState } from "../../utils/createTestState";
import {
  TestAction,
  TEST_DEBUG,
  TEST_LAYOUT_CHANGE,
  TEST_MODE_CHANGE,
  TEST_PAUSE,
  TEST_PLAYER_VISIBILITY,
  TEST_SET_COMPILING,
  TEST_STEP,
} from "../actions/testActions";
import { Layout, Mode, TestState } from "../state/testState";

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

const doTestPause = (
  state: TestState,
  payload: { pause: boolean }
): TestState => {
  const { pause } = payload;

  return {
    ...state,
    paused: pause,
  };
};

const doTestStep = (state: TestState, payload: { step: number }): TestState => {
  const { step } = payload;

  return {
    ...state,
    playback: (state.playback ?? 0) + (step ?? 0),
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

const doSetCompiling = (
  state: TestState,
  payload: { id: string; compiling: boolean }
): TestState => {
  const { id, compiling } = payload;

  if (state?.compiling?.[id] === compiling) {
    return state;
  }
  return {
    ...state,
    compiling: {
      ...(state?.compiling || {}),
      [id]: compiling,
    },
  };
};

export const testReducer = (
  state = createTestState(),
  action: TestAction = undefined
): TestState => {
  switch (action.type) {
    case TEST_MODE_CHANGE:
      return doTestModeChange(state, action.payload);
    case TEST_PAUSE:
      return doTestPause(state, action.payload);
    case TEST_STEP:
      return doTestStep(state, action.payload);
    case TEST_LAYOUT_CHANGE:
      return doTestLayoutChange(state, action.payload);
    case TEST_DEBUG:
      return doTestDebug(state, action.payload);
    case TEST_PLAYER_VISIBILITY:
      return doPlayerVisibility(state, action.payload);
    case TEST_SET_COMPILING:
      return doSetCompiling(state, action.payload);
    default:
      return state;
  }
};
