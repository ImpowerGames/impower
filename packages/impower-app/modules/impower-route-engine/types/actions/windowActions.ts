import { WindowType } from "../state/windowState";

export const WINDOW_SWITCH = "WINDOW_SWITCH";
export interface WindowSwitchAction {
  type: typeof WINDOW_SWITCH;
  payload: { window: WindowType };
}
export const windowSwitch = (window: WindowType): WindowSwitchAction => {
  return { type: WINDOW_SWITCH, payload: { window } };
};

export type WindowAction = WindowSwitchAction;
