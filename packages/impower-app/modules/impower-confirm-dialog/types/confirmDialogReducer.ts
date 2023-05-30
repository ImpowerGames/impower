import {
  ConfirmDialogAction,
  CONFIRM_DIALOG_CLOSE,
  CONFIRM_DIALOG_NAV_OPEN,
  CONFIRM_DIALOG_OPEN,
} from "./confirmDialogActions";
import { ConfirmDialogState } from "./confirmDialogState";

export const confirmDialogReducer = (
  state: ConfirmDialogState,
  action: ConfirmDialogAction
): ConfirmDialogState => {
  switch (action.type) {
    case CONFIRM_DIALOG_OPEN:
    case CONFIRM_DIALOG_NAV_OPEN: {
      const {
        title,
        content,
        agreeLabel,
        onAgree,
        disagreeLabel,
        onDisagree,
        options,
      } = action.payload;
      return {
        ...state,
        mount: true,
        open: true,
        title,
        content,
        agreeLabel,
        onAgree,
        disagreeLabel,
        onDisagree,
        disableAutoFocus: options?.disableAutoFocus,
        disableEnforceFocus: options?.disableEnforceFocus,
        disableRestoreFocus: options?.disableRestoreFocus,
        asynchronous: options?.asynchronous,
        responsive: options?.responsive,
      };
    }
    case CONFIRM_DIALOG_CLOSE: {
      return { ...state, open: false };
    }
    default:
      throw new Error(`ConfirmDialog Action not recognized: ${action}`);
  }
};
