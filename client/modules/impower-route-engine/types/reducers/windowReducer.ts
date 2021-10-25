import {
  WindowState,
  createWindowState,
  WindowType,
} from "../state/windowState";
import { WindowAction, WINDOW_SWITCH } from "../actions/windowActions";

const doWindowSwitch = (
  state: WindowState,
  payload: { window: WindowType }
): WindowState => {
  const { window } = payload;

  if (state.type === window) {
    return state;
  }

  return {
    ...state,
    type: window,
  };
};

export const windowReducer = (
  state = createWindowState(),
  action: WindowAction
): WindowState => {
  switch (action.type) {
    case WINDOW_SWITCH:
      return doWindowSwitch(state, action.payload);
    default:
      return state;
  }
};
