import { createWindowState } from "../../utils/createWindowState";
import { WindowAction, WINDOW_SWITCH } from "../actions/windowActions";
import { WindowState, WindowType } from "../state/windowState";

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
  action: WindowAction = undefined
): WindowState => {
  switch (action.type) {
    case WINDOW_SWITCH:
      return doWindowSwitch(state, action.payload);
    default:
      return state;
  }
};
