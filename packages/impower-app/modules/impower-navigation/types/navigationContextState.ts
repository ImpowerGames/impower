import { Dispatch } from "react";
import { NavigationAction } from "./navigationActions";
import { createNavigationState, NavigationState } from "./navigationState";

export type NavigationContextState = [
  NavigationState,
  Dispatch<NavigationAction>
];

export const createNavigationContextState = (): NavigationContextState => [
  createNavigationState(),
  (): void => null,
];
