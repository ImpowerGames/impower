import { ToastTopAction, TOAST_TOP } from "../types/actions/toastTopAction";
import { AlertColor } from "../types/enums/alertColor";

const toastTop = (
  message: string,
  severity?: AlertColor,
  autoHideDuration?: number,
  actionLabel?: React.ReactNode,
  onAction?: () => void
): ToastTopAction => {
  return {
    type: TOAST_TOP,
    payload: { message, severity, autoHideDuration, actionLabel, onAction },
  };
};

export default toastTop;
