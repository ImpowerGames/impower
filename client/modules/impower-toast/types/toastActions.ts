import { ToastCloseAction } from "./actions/toastCloseAction";
import { ToastLeftAction } from "./actions/toastLeftAction";
import { ToastTopAction } from "./actions/toastTopAction";

export type ToastAction = ToastTopAction | ToastLeftAction | ToastCloseAction;
