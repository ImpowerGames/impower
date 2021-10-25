import { TOAST_CLOSE } from "./actions/toastCloseAction";
import { TOAST_LEFT } from "./actions/toastLeftAction";
import { TOAST_TOP } from "./actions/toastTopAction";
import { ToastAction } from "./toastActions";
import { ToastState } from "./toastState";

export const toastReducer = (
  state: ToastState,
  action: ToastAction
): ToastState => {
  switch (action.type) {
    case TOAST_TOP: {
      const { message, severity, autoHideDuration, actionLabel, onAction } =
        action.payload;
      return {
        ...state,
        mount: true,
        open: true,
        id: new Date().getTime().toString(),
        message,
        severity,
        autoHideDuration,
        actionLabel,
        anchorOrigin: { vertical: "top", horizontal: "center" },
        direction: "down",
        onAction,
      };
    }
    case TOAST_LEFT: {
      const { message, severity, autoHideDuration, actionLabel, onAction } =
        action.payload;
      return {
        ...state,
        mount: true,
        open: true,
        id: new Date().getTime().toString(),
        message,
        severity,
        autoHideDuration,
        actionLabel,
        anchorOrigin: { vertical: "bottom", horizontal: "left" },
        direction: "right",
        onAction,
      };
    }
    case TOAST_CLOSE: {
      return {
        ...state,
        open: false,
      };
    }
    default:
      throw new Error(`Toast Action not recognized: ${action}`);
  }
};
