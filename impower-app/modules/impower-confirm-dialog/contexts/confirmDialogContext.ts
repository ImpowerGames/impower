import React from "react";
import { ConfirmDialogContextState } from "../types/confirmDialogContextState";

export const ConfirmDialogContext =
  React.createContext<ConfirmDialogContextState>(undefined);
