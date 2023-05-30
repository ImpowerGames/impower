import {
  ToastCloseAction,
  TOAST_CLOSE,
} from "../types/actions/toastCloseAction";

const toastClose = (): ToastCloseAction => {
  return {
    type: TOAST_CLOSE,
  };
};

export default toastClose;
