import { useCallback, useReducer } from "react";
import { useDialogNavigation } from "../../impower-dialog";
import {
  ConfirmDialogAction,
  CONFIRM_DIALOG_NAV_OPEN,
} from "../types/confirmDialogActions";
import { ConfirmDialogContextState } from "../types/confirmDialogContextState";
import { confirmDialogReducer } from "../types/confirmDialogReducer";
import {
  ConfirmDialogState,
  createConfirmDialogState,
} from "../types/confirmDialogState";

export const useConfirmDialogContextState = (): ConfirmDialogContextState => {
  const [openAppDialog] = useDialogNavigation("a");

  const wrappedConfirmDialogReducer = useCallback(
    (
      state: ConfirmDialogState,
      action: ConfirmDialogAction
    ): ConfirmDialogState => {
      switch (action.type) {
        case CONFIRM_DIALOG_NAV_OPEN: {
          openAppDialog("confirm");
          break;
        }
        default:
          break;
      }
      return confirmDialogReducer(state, action);
    },
    [openAppDialog]
  );

  return useReducer(wrappedConfirmDialogReducer, createConfirmDialogState());
};
