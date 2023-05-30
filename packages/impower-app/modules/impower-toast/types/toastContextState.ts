import { Dispatch } from "react";
import { ToastAction } from "./toastActions";
import { createToastState, ToastState } from "./toastState";

export type ToastContextState = [ToastState, Dispatch<ToastAction>];

export const createToastContextState = (): ToastContextState => [
  createToastState(),
  (): void => null,
];
