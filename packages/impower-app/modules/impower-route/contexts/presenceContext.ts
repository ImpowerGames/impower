import React from "react";

export interface PresenceContextProps {
  id: number;
  isPresent: boolean;
  isFirstTime: boolean;
  disableFirstTimeEnter?: boolean;
  exitProps?: Record<string, unknown>;
  onExitComplete?: (e?: React.TransitionEvent) => void;
}

/**
 * @public
 */
export const PresenceContext = React.createContext<PresenceContextProps | null>(
  null
);
