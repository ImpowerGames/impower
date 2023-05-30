import {
  NavigationSetElevationAction,
  NAVIGATION_SET_ELEVATION,
} from "../types/actions/navigationSetElevationAction";

const navigationSetElevation = (
  elevation?: number
): NavigationSetElevationAction => {
  return {
    type: NAVIGATION_SET_ELEVATION,
    payload: { elevation },
  };
};

export default navigationSetElevation;
