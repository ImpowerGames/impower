import { ToastLeftAction, TOAST_LEFT } from "../types/actions/toastLeftAction";
import { AlertColor } from "../types/enums/alertColor";

const toastLeft = (
  message: string,
  severity?: AlertColor,
  autoHideDuration?: number,
  actionLabel?: React.ReactNode,
  onAction?: () => void
): ToastLeftAction => {
  return {
    type: TOAST_LEFT,
    payload: { message, severity, autoHideDuration, actionLabel, onAction },
  };
};

export default toastLeft;
