import { AlertColor } from "../enums/alertColor";

export const TOAST_TOP = "@impower/toast/TOP";
export interface ToastTopAction {
  type: typeof TOAST_TOP;
  payload: {
    message: string;
    severity?: AlertColor;
    autoHideDuration?: number;
    actionLabel?: React.ReactNode;
    onAction?: () => void;
  };
}
