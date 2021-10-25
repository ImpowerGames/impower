import { useReducer } from "react";
import { navigationReducer } from "../types/navigationReducer";
import { createNavigationState } from "../types/navigationState";
import { NavigationContextState } from "../types/navigationContextState";

export const useNavigationContextState = (): NavigationContextState => {
  return useReducer(navigationReducer, createNavigationState());
};
