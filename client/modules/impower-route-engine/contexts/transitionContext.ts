import React from "react";
import { TransitionState } from "../../impower-route";

export const WindowTransitionContext = React.createContext<{
  transitionState?: TransitionState;
  portrait?: boolean;
}>({ transitionState: TransitionState.initial });
