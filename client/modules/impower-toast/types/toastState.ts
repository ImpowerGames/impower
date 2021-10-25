import React from "react";
import { AlertColor } from "./enums/alertColor";
import { SnackbarOrigin } from "./enums/snackbarOrigin";

export interface ToastState {
  mount?: boolean;
  id?: string;
  open: boolean;
  message: string;
  actionLabel?: React.ReactNode;
  autoHideDuration?: number;
  anchorOrigin?: SnackbarOrigin;
  severity?: AlertColor;
  direction?: "up" | "left" | "right" | "down";
  onAction?: () => void;
}

export const createToastState = (): ToastState => ({
  open: false,
  message: "",
});
