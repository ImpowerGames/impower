import React from "react";
import { NavigationContextState } from "../types/navigationContextState";

export const NavigationContext =
  React.createContext<NavigationContextState>(undefined);
