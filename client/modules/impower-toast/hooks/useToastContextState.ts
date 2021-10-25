import { useReducer } from "react";
import { toastReducer } from "../types/toastReducer";
import { createToastState } from "../types/toastState";
import { ToastContextState } from "../types/toastContextState";

export const useToastContextState = (): ToastContextState => {
  return useReducer(toastReducer, createToastState());
};
