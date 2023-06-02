import {
  NavigationSetTransitioningAction,
  NAVIGATION_SET_TRANSITIONING,
} from "../types/actions/navigationSetTransitioningAction";

const navigationSetTransitioning = (
  transitioning: boolean
): NavigationSetTransitioningAction => {
  return {
    type: NAVIGATION_SET_TRANSITIONING,
    payload: {
      transitioning,
    },
  };
};

export default navigationSetTransitioning;
