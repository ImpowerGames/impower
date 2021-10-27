import {
  NavigationDismissBetaWarningAction,
  NAVIGATION_DISMISS_BETA_WARNING,
} from "../types/actions/navigationDismissBetaWarningAction";

const navigationDismissBetaWarning = (): NavigationDismissBetaWarningAction => {
  return {
    type: NAVIGATION_DISMISS_BETA_WARNING,
  };
};

export default navigationDismissBetaWarning;
