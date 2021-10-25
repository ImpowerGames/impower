import React from "react";
import { ToastContextState } from "../types/toastContextState";

export const ToastContext = React.createContext<ToastContextState>(undefined);
