import { AlertColor } from "../enums/alertColor";

export const TOAST_LEFT = "@impower/toast/LEFT";
export interface ToastLeftAction {
  type: typeof TOAST_LEFT;
  payload: {
    message: string;
    severity?: AlertColor;
    autoHideDuration?: number;
    actionLabel?: React.ReactNode;
    onAction?: () => void;
  };
}
